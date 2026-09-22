import { describe, expect, it } from 'vitest';

import { createSingleFlight } from '../../src/infrastructure/single-flight.js';

describe('createSingleFlight', () => {
  it('shares one operation and promise between concurrent calls with the same key', async () => {
    const singleFlight = createSingleFlight();
    const pending = Promise.withResolvers<number>();
    let executions = 0;
    const operation = (): Promise<number> => {
      executions += 1;
      return pending.promise;
    };

    const first = singleFlight.run('same-key', operation);
    const second = singleFlight.run('same-key', operation);

    expect(first).toBe(second);
    await Promise.resolve();
    expect(executions).toBe(1);

    pending.resolve(42);

    await expect(Promise.all([first, second])).resolves.toEqual([42, 42]);
  });

  it('runs operations with different keys independently', async () => {
    const singleFlight = createSingleFlight();
    let executions = 0;

    const results = await Promise.all([
      singleFlight.run('first-key', async () => {
        executions += 1;
        return 'first';
      }),
      singleFlight.run('second-key', async () => {
        executions += 1;
        return 'second';
      }),
    ]);

    expect(results).toEqual(['first', 'second']);
    expect(executions).toBe(2);
  });

  it('removes a successful operation so a later call can run again', async () => {
    const singleFlight = createSingleFlight();
    let executions = 0;
    const operation = async (): Promise<number> => {
      executions += 1;
      return executions;
    };

    await expect(singleFlight.run('reusable-key', operation)).resolves.toBe(1);
    await expect(singleFlight.run('reusable-key', operation)).resolves.toBe(2);
  });

  it('shares a rejection and removes it so a later call can recover', async () => {
    const singleFlight = createSingleFlight();
    const pending = Promise.withResolvers<never>();
    const failure = new Error('upstream failed');
    let executions = 0;
    const operation = (): Promise<never> => {
      executions += 1;
      return pending.promise;
    };

    const first = singleFlight.run('failing-key', operation);
    const second = singleFlight.run('failing-key', operation);
    const firstRejection = expect(first).rejects.toBe(failure);
    const secondRejection = expect(second).rejects.toBe(failure);

    pending.reject(failure);

    await Promise.all([firstRejection, secondRejection]);
    expect(executions).toBe(1);
    await expect(singleFlight.run('failing-key', async () => 'recovered')).resolves.toBe(
      'recovered',
    );
  });
});
