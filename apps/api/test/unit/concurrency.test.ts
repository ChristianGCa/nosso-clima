import { describe, expect, it } from 'vitest';

import { ApiError } from '../../src/errors/api-error.js';
import { createBoundedExecutor } from '../../src/infrastructure/concurrency.js';

describe('createBoundedExecutor', () => {
  it('never exceeds the configured concurrency and starts queued work in order', async () => {
    const executor = createBoundedExecutor({ maxConcurrency: 2 });
    const releases = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
    const starts: number[] = [];
    let running = 0;
    let maximumRunning = 0;

    const operations = releases.map((release, index) =>
      executor.run(async () => {
        starts.push(index);
        running += 1;
        maximumRunning = Math.max(maximumRunning, running);
        await release.promise;
        running -= 1;
        return index;
      }),
    );

    await Promise.resolve();
    expect(starts).toEqual([0, 1]);
    expect(maximumRunning).toBe(2);

    releases[0]?.resolve();
    await expect(operations[0]).resolves.toBe(0);
    await Promise.resolve();
    expect(starts).toEqual([0, 1, 2]);

    releases[1]?.resolve();
    await expect(operations[1]).resolves.toBe(1);
    await Promise.resolve();
    expect(starts).toEqual([0, 1, 2, 3]);

    releases[2]?.resolve();
    releases[3]?.resolve();

    await expect(Promise.all(operations)).resolves.toEqual([0, 1, 2, 3]);
    expect(maximumRunning).toBe(2);
  });

  it('rejects excess work immediately when the equally bounded queue is full', async () => {
    const executor = createBoundedExecutor({ maxConcurrency: 2 });
    const releases = Array.from({ length: 4 }, () => Promise.withResolvers<void>());
    let excessStarted = false;

    const accepted = releases.map((release) => executor.run(() => release.promise));
    const rejection = expect(
      executor.run(async () => {
        excessStarted = true;
      }),
    ).rejects.toEqual(new ApiError('SERVICE_UNAVAILABLE'));

    await rejection;
    expect(excessStarted).toBe(false);

    for (const release of releases) {
      release.resolve();
    }
    await Promise.all(accepted);
  });

  it('releases capacity and starts queued work after an operation rejects', async () => {
    const executor = createBoundedExecutor({ maxConcurrency: 1 });
    const pending = Promise.withResolvers<void>();
    const failure = new Error('upstream failed');
    let queuedStarted = false;

    const failingOperation = executor.run(() => pending.promise);
    const failingExpectation = expect(failingOperation).rejects.toBe(failure);
    const queuedOperation = executor.run(async () => {
      queuedStarted = true;
      return 'recovered';
    });

    await Promise.resolve();
    expect(queuedStarted).toBe(false);

    pending.reject(failure);

    await failingExpectation;
    await expect(queuedOperation).resolves.toBe('recovered');
    expect(queuedStarted).toBe(true);
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    'rejects an invalid concurrency limit: %s',
    (maxConcurrency) => {
      expect(() => createBoundedExecutor({ maxConcurrency })).toThrow(/maxConcurrency/);
    },
  );
});
