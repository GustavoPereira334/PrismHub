import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shipping configuration requires signing and keeps the desktop at user privilege', async () => {
  const { build } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(build.forceCodeSigning, true);
  assert.equal(build.win.requestedExecutionLevel, 'asInvoker');
  assert.equal(build.win.verifyUpdateCodeSignature, true);
});
