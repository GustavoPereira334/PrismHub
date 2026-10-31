import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDevice } from '../src/shared/contracts.js';
import { registerHardwareIpc } from '../src/modules/ipcHandlers.js';
import { HidManager } from '../src/modules/hidManager.js';
import { WomierSK80Adapter } from '../src/hardware/adapters/womier-sk80.js';
import { AttackSharkX11Adapter } from '../src/hardware/adapters/attack-shark-x11.js';
import { FuryCubeG11Adapter } from '../src/hardware/adapters/furycube-g11.js';

test('capability contract only accepts known literal booleans', () => {
  const device = normalizeDevice({ capabilities: { dpi: 'true', lighting: 1, pollingRate: true, arbitrary: true } });
  assert.equal(device.capabilities.dpi, false);
  assert.equal(device.capabilities.lighting, false);
  assert.equal(device.capabilities.pollingRate, true);
  assert.equal('arbitrary' in device.capabilities, false);
});

test('production HID registry cannot advertise or write unverified SK80 and X11 protocols', t => {
  for (const Adapter of [WomierSK80Adapter, AttackSharkX11Adapter]) {
    t.mock.method(Adapter.prototype, 'probe', () => assert.fail('Unverified adapter must stay outside production registry'));
  }
  t.mock.method(FuryCubeG11Adapter.prototype, 'probe', () => null);
  const manager = new HidManager();
  assert.deepEqual(manager.probe(), []);
  assert.equal(manager.prepareLighting({ target: 'keyboard', color: '#112233', brightness: 80, effect: 'estatico' }).targets.length, 0);
  assert.equal(manager.prepareLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }).targets.length, 0);
});

function ipcFixture() {
  const handlers = new Map(), calls = [], audit = [];
  let time = 0;
  const frame = { url: 'file:///app/index.html' };
  const contents = { mainFrame: frame, isDestroyed: () => false };
  const window = { webContents: contents, isDestroyed: () => false };
  registerHardwareIpc({ ipcMain: { handle: (c, fn) => handlers.set(c, fn), removeHandler: c => handlers.delete(c) },
    hardware: { list: () => [], status: () => ({}), refresh: () => { calls.push('refresh'); return []; }, applyLighting: r => { calls.push(r); return { sent: 1 }; } },
    getWindow: () => window, documentUrl: frame.url, now: () => time, logger: { record: (...args) => audit.push(args) } });
  return { handlers, calls, audit, frame, event: { sender: contents, senderFrame: frame }, tick: () => { time += 1000; } };
}

test('IPC rejects surplus arguments and payloads on read-only endpoints', () => {
  const x = ipcFixture();
  assert.throws(() => x.handlers.get('devices:list')(x.event, { nativePath: 'secret' }), /argument|parâmetro/i);
  assert.throws(() => x.handlers.get('lighting:apply')(x.event, { target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }, 'extra'), /argument|parâmetro/i);
  assert.deepEqual(x.calls, []);
});

test('IPC throttles hardware refreshes and writes before touching providers', async () => {
  const x = ipcFixture();
  await x.handlers.get('devices:refresh')(x.event);
  assert.throws(() => x.handlers.get('devices:refresh')(x.event), /Aguarde/);
  x.tick();
  await x.handlers.get('devices:refresh')(x.event);
  const request = { target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' };
  await x.handlers.get('lighting:apply')(x.event, request);
  assert.throws(() => x.handlers.get('lighting:apply')(x.event, request), /Aguarde/);
  assert.equal(x.calls.length, 3);
  assert.ok(x.audit.length > 0);
});
