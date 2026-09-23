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
  onStartupFailure?: (stage: StartupStage, failure: unknown) => void;
}>;

export type StartupStage = 'configuration' | 'application' | 'listen';

const CONFIGURATION_FIELDS = [
  'NODE_ENV',
  'HOST',
  'PORT',
  'LOG_LEVEL',
  'CORS_ALLOWED_ORIGINS',
  'TRUST_PROXY',
  'API_RATE_LIMIT_MAX',
  'API_RATE_LIMIT_WINDOW_MS',
  'CACHE_MAX_ENTRIES',
  'UPSTREAM_MAX_CONCURRENCY',
] as const;

export function describeStartupFailure(
  stage: StartupStage,
  failure: unknown,
): Record<string, string> {
  const diagnostic: Record<string, string> = { level: 'error', event: 'startup_failed', stage };
  if (stage === 'configuration' && failure instanceof Error) {
    const field = CONFIGURATION_FIELDS.find((name) => failure.message.includes(name));
    if (field) diagnostic.field = field;
  }
  if (stage === 'listen' && typeof failure === 'object' && failure !== null && 'code' in failure) {
    if (failure.code === 'EADDRINUSE' || failure.code === 'EACCES') {
      diagnostic.failureCode = failure.code;
    }
  }
  return diagnostic;
}

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
  let config: AppConfig;
  try {
    config = parseEnvironment(options.environment);
  } catch (failure) {
    options.onStartupFailure?.('configuration', failure);
    throw failure;
  }
  let app: ServerApp;
  try {
    app = options.createApp(config);
  } catch (failure) {
    options.onStartupFailure?.('application', failure);
    throw failure;
  }

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (startupFailure) {
    options.onStartupFailure?.('listen', startupFailure);
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
      onStartupFailure: (stage, failure) => {
        process.stderr.write(`${JSON.stringify(describeStartupFailure(stage, failure))}\n`);
      },
    });
  } catch {
    process.exitCode = 1;
  }
}
