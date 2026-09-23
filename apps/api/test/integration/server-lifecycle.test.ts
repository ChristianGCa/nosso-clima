import { describe, expect, it, vi } from 'vitest';

import {
  createShutdownHandler,
  type ShutdownSignal,
  type ShutdownTarget,
} from '../../src/lifecycle/shutdown.js';
import {
  createLoggerOptions,
  describeStartupFailure,
  type ServerApp,
  startServer,
} from '../../src/server.js';

describe('createShutdownHandler', () => {
  it.each<ShutdownSignal>(['SIGINT', 'SIGTERM'])(
    'closes the server and logs successful shutdown for %s',
    async (signal) => {
      const close = vi.fn(async () => undefined);
      const info = vi.fn();
      const error = vi.fn();
      const exitCodes: number[] = [];
      const target: ShutdownTarget = { close, log: { info, error } };
      const shutdown = createShutdownHandler(target, (code) => exitCodes.push(code));

      await shutdown(signal);

      expect(close).toHaveBeenCalledOnce();
      expect(info).toHaveBeenCalledWith(
        { event: 'graceful_shutdown', outcome: 'succeeded', signal },
        'graceful shutdown completed',
      );
      expect(error).not.toHaveBeenCalled();
      expect(exitCodes).toEqual([]);
    },
  );

  it('closes only once when multiple signals arrive during shutdown', async () => {
    const closePending = Promise.withResolvers<void>();
    const close = vi.fn(() => closePending.promise);
    const target: ShutdownTarget = {
      close,
      log: { info: vi.fn(), error: vi.fn() },
    };
    const shutdown = createShutdownHandler(target, vi.fn());

    const firstShutdown = shutdown('SIGINT');
    const repeatedShutdown = shutdown('SIGTERM');

    expect(repeatedShutdown).toBe(firstShutdown);
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();

    closePending.resolve();
    await firstShutdown;
  });

  it('logs a safe failure and selects a non-zero exit when closing rejects', async () => {
    const closeFailure = new Error('private close details');
    const info = vi.fn();
    const error = vi.fn();
    const exitCodes: number[] = [];
    const target: ShutdownTarget = {
      close: vi.fn(async () => {
        throw closeFailure;
      }),
      log: { info, error },
    };
    const shutdown = createShutdownHandler(target, (code) => exitCodes.push(code));

    await shutdown('SIGTERM');

    expect(error).toHaveBeenCalledWith(
      { event: 'graceful_shutdown', outcome: 'failed', signal: 'SIGTERM' },
      'graceful shutdown failed',
    );
    expect(info).not.toHaveBeenCalled();
    expect(exitCodes).toEqual([1]);
    expect(JSON.stringify(error.mock.calls)).not.toContain(closeFailure.message);
  });
});

describe('startServer', () => {
  it('fails before creating the app when NODE_ENV is missing', async () => {
    const createApp = vi.fn();
    const onStartupFailure = vi.fn();
    await expect(
      startServer({
        environment: {},
        createApp,
        onStartupFailure,
        onSignal: vi.fn(),
        setExitCode: vi.fn(),
      }),
    ).rejects.toThrow(/NODE_ENV/);
    expect(createApp).not.toHaveBeenCalled();
    expect(onStartupFailure).toHaveBeenCalledWith('configuration', expect.any(Error));
  });
  it('fails invalid configuration before creating or listening with an app', async () => {
    const createApp = vi.fn();
    const onStartupFailure = vi.fn();

    await expect(
      startServer({
        environment: { NODE_ENV: 'production' },
        createApp,
        onStartupFailure,
        onSignal: vi.fn(),
        setExitCode: vi.fn(),
      }),
    ).rejects.toThrow(/HOST/);

    expect(createApp).not.toHaveBeenCalled();
    expect(onStartupFailure).toHaveBeenCalledWith('configuration', expect.any(Error));
  });

  it('describes startup failures with allowlisted diagnostics only', () => {
    expect(
      describeStartupFailure('configuration', new Error('PORT must be private-secret')),
    ).toEqual({
      level: 'error',
      event: 'startup_failed',
      stage: 'configuration',
      field: 'PORT',
    });
    expect(
      describeStartupFailure('configuration', new Error('bad CORS_ALLOWED_ORIGINS *')),
    ).toEqual({
      level: 'error',
      event: 'startup_failed',
      stage: 'configuration',
      field: 'CORS_ALLOWED_ORIGINS',
    });
    expect(
      describeStartupFailure(
        'listen',
        Object.assign(new Error('private path'), { code: 'EADDRINUSE' }),
      ),
    ).toEqual({
      level: 'error',
      event: 'startup_failed',
      stage: 'listen',
      failureCode: 'EADDRINUSE',
    });
  });

  it('listens with validated configuration and connects both shutdown signals', async () => {
    const listen = vi.fn(async () => 'http://127.0.0.1:43117');
    const close = vi.fn(async () => undefined);
    const app: ServerApp = {
      listen,
      close,
      log: { info: vi.fn(), error: vi.fn() },
    };
    const signalHandlers = new Map<ShutdownSignal, () => void>();

    await startServer({
      environment: { NODE_ENV: 'test', HOST: '127.0.0.1', PORT: '43117' },
      createApp: () => app,
      onSignal: (signal, handler) => signalHandlers.set(signal, handler),
      setExitCode: vi.fn(),
    });

    expect(listen).toHaveBeenCalledWith({ host: '127.0.0.1', port: 43_117 });
    expect([...signalHandlers.keys()]).toEqual(['SIGINT', 'SIGTERM']);

    signalHandlers.get('SIGTERM')?.();
    await Promise.resolve();
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the app and propagates a startup failure from listen', async () => {
    const startupFailure = new Error('listen failed');
    const close = vi.fn(async () => undefined);
    const app: ServerApp = {
      listen: vi.fn(async () => {
        throw startupFailure;
      }),
      close,
      log: { info: vi.fn(), error: vi.fn() },
    };

    await expect(
      startServer({
        environment: { NODE_ENV: 'test' },
        createApp: () => app,
        onSignal: vi.fn(),
        setExitCode: vi.fn(),
      }),
    ).rejects.toBe(startupFailure);

    expect(close).toHaveBeenCalledOnce();
  });

  it('enables pretty logs only in development', () => {
    expect(createLoggerOptions({ nodeEnv: 'development', logLevel: 'debug' })).toEqual({
      level: 'debug',
      transport: { target: 'pino-pretty' },
    });
    expect(createLoggerOptions({ nodeEnv: 'production', logLevel: 'info' })).toEqual({
      level: 'info',
    });
  });
});
