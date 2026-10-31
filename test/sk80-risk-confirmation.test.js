import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HardwareService } from '../src/hardware/hardware-service.js';
import { WomierSK80Adapter, findSK80FeatureInterface } from '../src/hardware/adapters/womier-sk80.js';
import { HidManager } from '../src/modules/hidManager.js';
import { EventEmitter } from 'node:events';

const request = { target: 'keyboard', color: '#112233', brightness: 80, effect: 'estatico' };

test('SK80 stays detected-only without physical PrismHub protocol validation', async (t) => {
  const calls = [];
  t.mock.method(WomierSK80Adapter.prototype, 'probe', () => ({ adapterId: 'womier-sk80', lightingEffects: ['estatico'] }));
  t.mock.method(WomierSK80Adapter.prototype, 'applyLighting', async (options) => {
    calls.push(options);
    return { written: 1170, reports: 18, responses: 8 };
  });
  const openrgb = Object.assign(new EventEmitter(), {
    status: () => ({ state: 'disconnected' }), refresh: async () => [], prepareLighting: () => ({ controllers: [] })
  });
  const service = new HardwareService({ hidManager: new HidManager(), openrgb, discover: async () => [] });
  await assert.rejects(service.applyLighting(request), /Nenhum dispositivo/);
  // A renderer flag cannot override protocol validation.
  await assert.rejects(service.applyLighting({ ...request, acceptExperimentalRisk: true }), /inválid/);
  await assert.rejects(service.applyLighting({ ...request, color: '#fff' }), /Cor inválida/);
  await assert.rejects(service.applyLighting({ ...request, brightness: 101 }), /Brilho inválido/);
  assert.equal(calls.length, 0);
});

test('SK80 rejects mismatched hardware interfaces before opening a transport', () => {
  const valid = { vendorId: 0x05ac, productId: 0x024f, interface: 3, usagePage: 0xff13, usage: 1, path: 'hid#vid_05ac&pid_024f&MI_03#device' };
  assert.equal(findSK80FeatureInterface([valid]), valid);
  for (const mismatch of [{ vendorId: 1 }, { productId: 1 }, { interface: 2 }, { usagePage: 1 }, { usage: 2 }, { path: 'hid#MI_02#device' }]) {
    const devices = [{ ...valid, ...mismatch }];
    assert.equal(findSK80FeatureInterface(devices), null);
    const adapter = new WomierSK80Adapter({ devices: () => devices }, class {
      constructor() { assert.fail('Incompatible interface must not be opened'); }
    });
    assert.equal(adapter.probe(), null);
  }
});

test('lighting UI contains no experimental risk confirmation', () => {
  for (const path of ['../src/renderer/index.html', '../src/renderer/modules/lighting.js']) {
    assert.doesNotMatch(readFileSync(new URL(path, import.meta.url), 'utf8'), /acceptExperimentalRisk|aviso de risco/i);
  }
});
