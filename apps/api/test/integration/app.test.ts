import { describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';

describe('buildApp', () => {
  it('readies and closes an injectable app without opening a network port', async () => {
    const app = buildApp();

    try {
      await app.ready();

      const response = await app.inject({
        method: 'GET',
        url: '/not-registered',
      });

      expect(response.statusCode).toBe(404);
      expect(app.server.listening).toBe(false);
    } finally {
      await app.close();
    }
  });
});
