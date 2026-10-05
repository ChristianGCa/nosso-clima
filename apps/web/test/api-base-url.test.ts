import { describe, expect, it } from 'vitest';

import { resolveApiBaseUrl } from '../src/api/base-url';

describe('production API base URL', () => {
  const ownOrigin = 'https://clima.example.com';

  it('uses relative API paths when the variable is absent', () => {
    expect(resolveApiBaseUrl(undefined, true, ownOrigin)).toBe('');
  });

  it('accepts only the exact HTTPS origin of this web deployment', () => {
    expect(resolveApiBaseUrl(`${ownOrigin}/`, true, ownOrigin)).toBe(ownOrigin);
  });

  it.each([
    '',
    'http://clima.example.com',
    'http://localhost:3000',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::1]',
    'https://api.example.com',
    'https://clima.example.com/path',
    'https://clima.example.com/?token=x',
    'https://user:pass@clima.example.com',
    'https://clima.example.com#hash',
    '//clima.example.com',
    'https://clima.example.com.evil.test',
  ])('rejects an unsafe or different production origin: %s', (configured) => {
    expect(() => resolveApiBaseUrl(configured, true, ownOrigin)).toThrow(
      'Invalid VITE_API_BASE_URL',
    );
  });

  it('fails closed when no own origin is available to validate an override', () => {
    expect(() => resolveApiBaseUrl(ownOrigin, true, undefined)).toThrow(
      'Invalid VITE_API_BASE_URL',
    );
  });

  it('keeps the optional local development origin for the Vite proxy workflow', () => {
    expect(resolveApiBaseUrl('http://localhost:3000/', false, 'http://localhost:5173')).toBe(
      'http://localhost:3000',
    );
    expect(resolveApiBaseUrl('', false, 'http://localhost:5173')).toBe('');
  });
});
