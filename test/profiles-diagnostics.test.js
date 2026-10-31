import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const profile = { id: 'test-profile', name: 'Jogo', executable: 'game.exe', autoApply: false, lighting: { target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico', speed: 55 }, mouse: { stages: [400, 800, 1600, 3200, 6400], selected: 1, buttons: ['Clique esquerdo', 'Clique direito', 'Clique do meio', 'Voltar', 'Avançar'], pollingRate: 1000 }, uiScale: '100' };

test('legacy local mouse storage tolerates null entries and migrates only valid bounded preferences', async () => {
  const { normalizeLegacyMouseProfiles } = await import('../src/shared/profiles.js');
  const valid = { id: 'legacy', name: 'Local', ...profile.mouse };
  assert.deepEqual(normalizeLegacyMouseProfiles({ items: [null, 7, {}, valid, valid, { ...valid, id: 'bad', stages: [1] }] }), [valid]);
  assert.deepEqual(normalizeLegacyMouseProfiles(null), []);
});

test('profiles persist validated copies, reject duplicate bindings and preserve the previous file on invalid input', async t => {
  const { ProfileStore } = await import('../src/modules/profileStore.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-profile-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ProfileStore({ directory });
  await store.save(profile);
  profile.name = 'Changed outside store';
  assert.equal((await store.list()).items[0].name, 'Jogo');
  await assert.rejects(store.save({ ...profile, id: 'different' }), /aplicativo/i);
  await assert.rejects(store.save({ ...profile, mouse: { ...profile.mouse, stages: [1] } }));
  const reopened = new ProfileStore({ directory });
  assert.equal((await reopened.list()).items.length, 1);
  await reopened.remove('test-profile');
  assert.equal((await new ProfileStore({ directory }).list()).items.length, 0);
});

test('corrupt profile storage is reported and is not silently overwritten', async t => {
  const { ProfileStore } = await import('../src/modules/profileStore.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-corrupt-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'setup-profiles.json'), 'broken JSON');
  const store = new ProfileStore({ directory });
  await assert.rejects(store.list(), /perfis/i);
  await assert.rejects(store.save(profile), /perfis/i);
});

test('automatic profiles require opt in and a foreground transition, never retry failures', async () => {
  const { ProfileAutomation } = await import('../src/modules/profileAutomation.js');
  const calls = [];
  const stored = { ...profile, autoApply: false };
  const automation = new ProfileAutomation({ profiles: { list: async () => ({ items: [stored] }) }, apply: async p => { calls.push(p.id); throw Error('uncertain write'); } });
  await automation.foreground('game.exe');
  assert.deepEqual(calls, []);
  stored.autoApply = true;
  await automation.foreground('other.exe');
  await automation.foreground('game.exe');
  await automation.foreground('game.exe');
  assert.deepEqual(calls, ['test-profile']);
});

test('diagnostics omit names, IDs, raw errors and serials, and explain unavailable controls', async () => {
  const { buildDiagnostics } = await import('../src/modules/diagnostics.js');
  const report = buildDiagnostics({ version: '0.1.0', devices: [{ id: 'PRIVATE_PATH', name: 'PRIVATE_SERIAL', vid: '1D57', pid: 'FA60', category: 'input', state: 'detected', capabilities: { lighting: false, dpi: false } }], status: { worker: { state: 'ready' }, discovery: { state: 'connected', message: 'PRIVATE_ERROR' }, openrgb: { state: 'disconnected' } } });
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  assert.match(report.devices[0].reasons.dpi, /protocolo/i);
  assert.equal(report.devices[0].capabilities.dpi, false);
  assert.equal(report.devices[0].reference, 'device-1');
});
