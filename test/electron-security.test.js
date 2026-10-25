import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('uses a sandbox-compatible CommonJS preload while preserving isolation', async () => {
  const main = await readFile(new URL('../src/modules/main.js', import.meta.url), 'utf8');
  const preload = await readFile(new URL('../src/preload/preload.cjs', import.meta.url), 'utf8').catch(() => '');

  assert.match(main, /preload\.cjs/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(preload, /require\(['"]electron['"]\)/);
  assert.doesNotMatch(preload, /^\s*import\s/m);
});
