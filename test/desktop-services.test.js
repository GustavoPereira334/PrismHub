import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ProfileStore } from '../src/modules/profileStore.js';
import { createDesktopServices } from '../src/modules/desktopServices.js';
import { registerHardwareIpc } from '../src/modules/ipcHandlers.js';

const profile = { id: 'example', name: 'Example', executable: 'game.exe', autoApply: true, lighting: { target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico', speed: 55 }, mouse: { stages: [400, 800, 1600, 3200, 6400], selected: 1, buttons: ['Clique esquerdo', 'Clique direito', 'Clique do meio', 'Voltar', 'Avançar'], pollingRate: 1000 }, uiScale: '100' };

test('exported diagnostics contain no private fields, and imported profiles cannot activate automatic writes', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-desktop-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const profiles = new ProfileStore({ directory });
  const file = path.join(directory, 'selected.json');
  let writes = 0;
  const hardware = { list: () => [{ id: 'PRIVATE_PATH', name: 'PRIVATE_SERIAL', capabilities: {} }], status: () => ({ discovery: { state: 'connected', message: 'PRIVATE_ERROR' } }), applyLighting: async () => { writes++; return { sent: 1 }; } };
  const services = createDesktopServices({ hardware, profiles, version: '0.1.0', getWindow: () => ({}), dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: file }),
    showOpenDialog: async () => ({ canceled: false, filePaths: [file] }),
    showMessageBox: async () => ({ response: 1 })
  } });
  assert.deepEqual(await services.diagnostics.export(), { cancelled: false });
  assert.doesNotMatch(await readFile(file, 'utf8'), /PRIVATE/);
  await writeFile(file, JSON.stringify({ version: 1, items: [profile] }));
  await services.profiles.import();
  assert.equal((await profiles.list()).items[0].autoApply, false);
  await assert.rejects(services.profiles.applyAutomatic('example', { isCurrent: () => true }), /não autorizada/);
  assert.equal(writes, 0);
  const result = await services.profiles.apply('example');
  assert.equal(writes, 1);
  assert.ok(result.skipped.includes('dpi'));
});

test('desktop IPC endpoints enforce the same origin and arity rules before dialogs or profile mutations', () => {
  let touched = false;
  const call = () => { touched = true; };
  const services = { diagnostics: { get: call, export: call }, profiles: { list: call, save: call, remove: call, apply: call, export: call, import: call }, updates: { status: call, check: call, stage: call, install: call } };
  const frame = { url: 'file:///trusted/index.html' }, contents = { mainFrame: frame, isDestroyed: () => false };
  const window = { webContents: contents, isDestroyed: () => false }, handlers = new Map();
  registerHardwareIpc({ hardware: {}, services, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, getWindow: () => window, documentUrl: frame.url });
  for (const [name, handler] of handlers) {
    assert.throws(() => handler({ sender: {}, senderFrame: frame }), /origem/i, name);
  }
  assert.throws(() => handlers.get('diagnostics:export')({ sender: contents, senderFrame: frame }, 'C:\\private'), /argument/i);
  assert.equal(touched, false);
});
