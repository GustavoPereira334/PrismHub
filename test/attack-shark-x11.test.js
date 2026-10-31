import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttackSharkX11Adapter,
  buildX11LightingReport,
  findX11FeatureInterface,
  parseHexColor,
} from '../src/hardware/adapters/attack-shark-x11.js';

test('selects only the X11 feature collection used for configuration', () => {
  const devices = [
    { vendorId: 0x1d57, productId: 0xfa55, interface: 2, path: 'hid#col01' },
    { vendorId: 0x1d57, productId: 0xfa55, interface: 2, path: 'hid#col04' },
    { vendorId: 0x1d57, productId: 0xfa55, interface: 1, path: 'hid#col04' },
  ];

  assert.equal(findX11FeatureInterface(devices)?.path, 'hid#col04');
  assert.equal(findX11FeatureInterface([{ vendorId: 1, productId: 2, interface: 2, path: 'hid#col04' }]), null);
});

test('opens the confirmed feature path, writes once, and always closes it', async () => {
  const calls = [];
  const fakeHid = {
    devices: () => [{ vendorId: 0x1d57, productId: 0xfa55, interface: 2, path: 'hid#col04' }],
    HID: class {
      constructor(path) { calls.push(['open', path]); }
      sendFeatureReport(report) { calls.push(['write', report]); return report.length; }
      close() { calls.push(['close']); }
    },
  };
  const adapter = new AttackSharkX11Adapter(fakeHid);
  const detected = adapter.probe();
  const result = await adapter.applyLighting(detected.featurePath, { color: '#112233', effect: 'estatico', speed: 50 });

  assert.equal(result.written, 15);
  assert.deepEqual(calls.map(([operation]) => operation), ['open', 'close', 'open', 'write', 'close']);
});

test('does not claim the FuryCube G11 as an Attack Shark adapter', () => {
  const devices = [{ vendorId: 0x1d57, productId: 0xfa60, interface: 2, path: 'hid#col04' }];
  assert.equal(findX11FeatureInterface(devices), null);
});

test('builds the documented wireless lighting report with validated values', () => {
  const report = buildX11LightingReport({ color: '#7C5CFF', effect: 'pulso', speed: 55 });

  assert.deepEqual([...report], [
    0x05, 0x0f, 0x01, 0x20, 0x03, 0xa8, 0x7c, 0x5c, 0xff, 0x14, 0x04, 0x02, 0xba, 0x00, 0x00,
  ]);
});

test('rejects unsupported effects and malformed colors before touching hardware', () => {
  assert.deepEqual(parseHexColor('#00FF7F'), { r: 0, g: 255, b: 127 });
  assert.throws(() => buildX11LightingReport({ color: '#fff', effect: 'estatico', speed: 50 }), /cor/i);
  assert.throws(() => buildX11LightingReport({ color: '#FFFFFF', effect: 'onda', speed: 50 }), /efeito/i);
});
