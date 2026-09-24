import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { prohibitedImports } from './check-boundaries.mjs';

const root = path.resolve(import.meta.dirname, '..');

test('rejects a web import from API source', () => {
  const file = path.join(root, 'apps/web/src/example.ts');
  assert.equal(prohibitedImports("import { x } from '../../api/src/app.js';", file).length, 1);
  assert.equal(prohibitedImports("import { x } from '@nosso-clima/api';", file).length, 1);
});

test('rejects an API import from web source, including dynamic import', () => {
  const file = path.join(root, 'apps/api/src/example.ts');
  assert.equal(prohibitedImports("export { x } from '../../web/src/app.js';", file).length, 1);
  assert.equal(prohibitedImports("void import('@nosso-clima/web');", file).length, 1);
});

test('accepts imports inside one application', () => {
  const file = path.join(root, 'apps/web/src/example.ts');
  assert.deepEqual(prohibitedImports("import { x } from './app';", file), []);
});
