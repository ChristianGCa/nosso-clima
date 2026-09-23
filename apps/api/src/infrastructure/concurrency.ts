import { ApiError } from '../errors/api-error.js';

type UpstreamSaturationLog = Readonly<{
  event: 'upstream_saturation';
}>;

type ConcurrencyLogger = Readonly<{
  warn(bindings: UpstreamSaturationLog, message: string): void;
}>;

export type BoundedExecutorOptions = Readonly<{
  maxConcurrency: number;
  logger?: ConcurrencyLogger;
}>;

export interface BoundedExecutor {
  run<Value>(operation: () => Promise<Value>): Promise<Value>;
}

export function createBoundedExecutor(options: BoundedExecutorOptions): BoundedExecutor {
  assertPositiveInteger(options.maxConcurrency, 'maxConcurrency');

  let runningOperations = 0;
  const waitingOperations: Array<() => void> = [];

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
        waitingOperations.shift()?.();
      });
  }

  return {
    run<Value>(operation: () => Promise<Value>): Promise<Value> {
      if (runningOperations >= options.maxConcurrency) {
        if (waitingOperations.length >= options.maxConcurrency) {
          options.logger?.warn({ event: 'upstream_saturation' }, 'upstream concurrency saturated');
          return Promise.reject(new ApiError('SERVICE_UNAVAILABLE'));
        }

        return new Promise<Value>((resolve, reject) => {
          waitingOperations.push(() => start(operation, resolve, reject));
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
