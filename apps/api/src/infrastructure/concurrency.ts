import { ApiError } from '../errors/api-error.js';

type UpstreamSaturationLog = Readonly<{
  event: 'upstream_saturation';
}>;

type ConcurrencyLogger = Readonly<{
  warn(bindings: UpstreamSaturationLog, message: string): void;
}>;

export type BoundedExecutorOptions = Readonly<{
  maxConcurrency: number;
  maxQueueWaitMs?: number;
  logger?: ConcurrencyLogger;
}>;

export interface BoundedExecutor {
  run<Value>(operation: () => Promise<Value>, logger?: ConcurrencyLogger): Promise<Value>;
}

export function createBoundedExecutor(options: BoundedExecutorOptions): BoundedExecutor {
  assertPositiveInteger(options.maxConcurrency, 'maxConcurrency');
  const maxQueueWaitMs = options.maxQueueWaitMs ?? 5_000;
  assertPositiveInteger(maxQueueWaitMs, 'maxQueueWaitMs');

  let runningOperations = 0;
  const waitingOperations: Array<
    Readonly<{ start: () => void; timer: ReturnType<typeof setTimeout> }>
  > = [];

  function start<Value>(
    operation: () => Promise<Value>,
    resolve: (value: Value | PromiseLike<Value>) => void,
    reject: (reason?: unknown) => void,
  ): void {
    runningOperations += 1;

    void Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => {
        runningOperations -= 1;
        const waiting = waitingOperations.shift();
        if (waiting) {
          clearTimeout(waiting.timer);
          waiting.start();
        }
      });
  }

  return {
    run<Value>(operation: () => Promise<Value>, logger = options.logger): Promise<Value> {
      if (runningOperations >= options.maxConcurrency) {
        if (waitingOperations.length >= options.maxConcurrency) {
          logger?.warn({ event: 'upstream_saturation' }, 'upstream concurrency saturated');
          return Promise.reject(new ApiError('SERVICE_UNAVAILABLE'));
        }

        return new Promise<Value>((resolve, reject) => {
          const startWaiting = (): void => start(operation, resolve, reject);
          const timer = setTimeout(() => {
            const position = waitingOperations.findIndex(
              (waiting) => waiting.start === startWaiting,
            );
            if (position !== -1) {
              waitingOperations.splice(position, 1);
              logger?.warn({ event: 'upstream_saturation' }, 'upstream queue wait expired');
              reject(new ApiError('SERVICE_UNAVAILABLE'));
            }
          }, maxQueueWaitMs);
          waitingOperations.push({ start: startWaiting, timer });
        });
      }

      return new Promise<Value>((resolve, reject) => {
        start(operation, resolve, reject);
      });
    },
  };
}

function assertPositiveInteger(value: number, optionName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive integer`);
  }
}
