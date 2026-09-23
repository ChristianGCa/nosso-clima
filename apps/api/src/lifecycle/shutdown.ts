export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export type ShutdownLog = Readonly<{
  event: 'graceful_shutdown';
  outcome: 'succeeded' | 'failed';
  signal: ShutdownSignal;
}>;

type ShutdownLogger = Readonly<{
  info(bindings: ShutdownLog, message: string): void;
  error(bindings: ShutdownLog, message: string): void;
}>;

export type ShutdownTarget = Readonly<{
  close(): Promise<void>;
  log: ShutdownLogger;
}>;

export type ShutdownHandler = (signal: ShutdownSignal) => Promise<void>;

export function createShutdownHandler(
  target: ShutdownTarget,
  setExitCode: (code: number) => void,
): ShutdownHandler {
  let shutdownPromise: Promise<void> | undefined;

  return (signal): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = Promise.resolve()
      .then(() => target.close())
      .then(
        () => {
          target.log.info(
            { event: 'graceful_shutdown', outcome: 'succeeded', signal },
            'graceful shutdown completed',
          );
        },
        () => {
          target.log.error(
            { event: 'graceful_shutdown', outcome: 'failed', signal },
            'graceful shutdown failed',
          );
          setExitCode(1);
        },
      );

    return shutdownPromise;
  };
}
