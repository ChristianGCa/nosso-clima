import { buildApp } from './app.js';
import {
  type AppConfig,
  type EnvironmentInput,
  type LogLevel,
  type NodeEnvironment,
  parseEnvironment,
} from './config/env.js';
import {
  createShutdownHandler,
  type ShutdownSignal,
  type ShutdownTarget,
} from './lifecycle/shutdown.js';

type ListenOptions = Readonly<{
  host: string;
  port: number;
}>;

export type ServerApp = ShutdownTarget &
  Readonly<{
    listen(options: ListenOptions): Promise<string>;
  }>;

export type StartServerOptions = Readonly<{
  environment: EnvironmentInput;
  createApp: (config: AppConfig) => ServerApp;
  onSignal: (signal: ShutdownSignal, handler: () => void) => void;
  setExitCode: (code: number) => void;
}>;

export type ServerLoggerOptions = Readonly<{
  level: LogLevel;
  transport?: Readonly<{ target: 'pino-pretty' }>;
}>;

export function createLoggerOptions(
  config: Readonly<{ nodeEnv: NodeEnvironment; logLevel: LogLevel }>,
): ServerLoggerOptions {
  if (config.nodeEnv === 'development') {
    return { level: config.logLevel, transport: { target: 'pino-pretty' } };
  }

  return { level: config.logLevel };
}

export async function startServer(options: StartServerOptions): Promise<void> {
  const config = parseEnvironment(options.environment);
  const app = options.createApp(config);

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (startupFailure) {
    try {
      await app.close();
    } catch (cleanupFailure) {
      throw new AggregateError(
        [startupFailure, cleanupFailure],
        'Server startup and cleanup failed',
      );
    }
    throw startupFailure;
  }

  const shutdown = createShutdownHandler(app, options.setExitCode);
  options.onSignal('SIGINT', () => void shutdown('SIGINT'));
  options.onSignal('SIGTERM', () => void shutdown('SIGTERM'));
}

if (import.meta.main) {
  try {
    await startServer({
      environment: process.env,
      createApp: (config) =>
        buildApp({
          config,
          logger: createLoggerOptions(config),
        }),
      onSignal: (signal, handler) => process.once(signal, handler),
      setExitCode: (code) => {
        process.exitCode = code;
      },
    });
  } catch {
    process.stderr.write(
      `${JSON.stringify({ level: 'error', event: 'startup_failed', message: 'server startup failed' })}\n`,
    );
    process.exitCode = 1;
  }
}
