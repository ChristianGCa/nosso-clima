import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createApp, ready, emit } = vi.hoisted(() => ({
  createApp: vi.fn(),
  ready: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('../../src/vercel-app.js', () => ({ createVercelApp: createApp }));

afterEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
});

describe('default Vercel request handler', () => {
  it('waits for readiness and forwards concurrent requests through one app', async () => {
    let release: (() => void) | undefined;
    ready.mockReturnValue(
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    );
    createApp.mockReturnValue({ ready, server: { emit } });
    const { default: handler } = await import('../../app.js');
    const request = new IncomingMessage(new Socket());
    const response = new ServerResponse(request);
    const secondRequest = new IncomingMessage(new Socket());
    const secondResponse = new ServerResponse(secondRequest);

    const pending = Promise.all([
      handler(request, response),
      handler(secondRequest, secondResponse),
    ]);
    expect(emit).not.toHaveBeenCalled();
    release?.();
    await pending;

    expect(createApp).toHaveBeenCalledExactlyOnceWith(process.env);
    expect(emit).toHaveBeenNthCalledWith(1, 'request', request, response);
    expect(emit).toHaveBeenNthCalledWith(2, 'request', secondRequest, secondResponse);
  });

  it('does not dispatch a request when initialization fails', async () => {
    ready.mockRejectedValue(new Error('fixture initialization failure'));
    createApp.mockReturnValue({ ready, server: { emit } });
    const { default: handler } = await import('../../app.js');
    const request = new IncomingMessage(new Socket());

    await expect(handler(request, new ServerResponse(request))).rejects.toThrow(
      'fixture initialization failure',
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
