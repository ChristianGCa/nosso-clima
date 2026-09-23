import { describe, expect, it, vi } from 'vitest';

import {
  createShutdownHandler,
  type ShutdownSignal,
  type ShutdownTarget,
} from '../../src/lifecycle/shutdown.js';

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
