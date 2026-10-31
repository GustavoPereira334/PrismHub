import test from 'node:test';
import assert from 'node:assert/strict';
import { HardwareService } from '../src/hardware/hardware-service.js';
import { AttackSharkX11Adapter } from '../src/hardware/adapters/attack-shark-x11.js';
import { WomierSK80Adapter } from '../src/hardware/adapters/womier-sk80.js';
import * as g11 from '../src/hardware/adapters/furycube-g11.js';

const feature = { vendorId: 0x1d57, productId: 0xfa60, product: 'G11 2.4G', release: 0x1110, interface: 2, usagePage: 0x0b, path: 'hid#VID_1D57&PID_FA60&MI_02&Col04#device' };
const options = { target: 'mouse', color: '#112233', brightness: 100, effect: 'estatico' };

function fakeHardware(overrides = {}) {
  const writes = [];
  let closes = 0;
  let opens = 0;
  const hid = {
    devices: () => [feature],
    HID: class {
      constructor(path) { assert.equal(path, feature.path); opens++; }
      sendFeatureReport(report) { writes.push([...report]); return report.length; }
      close() { closes++; }
    },
    ...overrides,
  };
  return { hid, writes, get closes() { return closes; }, get opens() { return opens; } };
}

test('selects only the observed G11 revision and feature collection', () => {
  assert.equal(g11.findG11FeatureInterface([feature]), feature);
  for (const mismatch of [{ vendorId: 1 }, { productId: 0xfa55 }, { release: 0x1111 }, { product: 'Unknown mouse' }, { interface: 1 }, { usagePage: 1 }, { usage: 1 }, { path: 'hid#MI_02&Col03#device' }]) {
    assert.equal(g11.findG11FeatureInterface([{ ...feature, ...mismatch }]), null);
  }
});

test('matches the three static RGB packets observed from the official HUB', () => {
  const captures = [
    ['#F20000', [5, 15, 1, 16, 3, 24, 242, 0, 0, 1, 2, 1, 32, 0, 0]],
    ['#22FF16', [5, 15, 1, 16, 3, 24, 34, 255, 22, 1, 2, 1, 101, 0, 0]],
    ['#2B0FFF', [5, 15, 1, 16, 3, 24, 43, 15, 255, 1, 2, 1, 103, 0, 0]],
  ];
  for (const [color, prefix] of captures) {
    const reports = g11.buildG11StaticReports({ ...options, color });
    assert.equal(reports.length, 2);
    const prepare = Buffer.alloc(134);
    prepare.set([12, 10, 1, 254, 1, 254]);
    assert.deepEqual(reports[0], prepare);
    const expected = Buffer.alloc(134);
    expected.set(prefix);
    assert.deepEqual(reports[1], expected);
  }
});

test('scales RGB brightness and preserves the 16-bit checksum including overflow', () => {
  const [, report] = g11.buildG11StaticReports({ ...options, color: '#FFFFFF', brightness: 50 });
  assert.deepEqual([...report.subarray(6, 9)], [128, 128, 128]);
  assert.equal(report.readUInt16BE(11), 430);
});

test('rejects unsupported effects and invalid values before opening hardware', async () => {
  const hw = fakeHardware();
  const adapter = new g11.FuryCubeG11Adapter(hw.hid);
  for (const invalid of [{ effect: 'onda' }, { color: '#fff' }, { brightness: 101 }, { brightness: 0.5 }]) {
    await assert.rejects(adapter.applyLighting({ ...options, ...invalid }));
  }
  assert.equal(hw.opens, 0);
});

test('probe is read-only and closes its handle', () => {
  const hw = fakeHardware();
  const found = new g11.FuryCubeG11Adapter(hw.hid).probe();
  assert.equal(found.adapterId, 'furycube-g11');
  assert.deepEqual(found.lightingEffects, ['estatico']);
  assert.equal(hw.writes.length, 0);
  assert.equal(hw.closes, 1);
});

test('applies only the captured preparation and lighting reports and closes the handle', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hw = fakeHardware();
  const adapter = new g11.FuryCubeG11Adapter(hw.hid);
  const operation = adapter.applyLighting(options);
  await Promise.resolve();
  assert.equal(hw.writes.length, 1);
  t.mock.timers.tick(500);
  const result = await operation;
  assert.equal(hw.writes.length, 2);
  assert.equal(hw.closes, 1);
  assert.deepEqual(result, { written: 268, reports: 2 });
  await assert.rejects(adapter.applyLighting(options), /Aguarde/);
});

test('rejects a disconnected or incompatible mouse without sending reports', async () => {
  const hw = fakeHardware({ devices: () => [{ ...feature, release: 0x1111 }] });
  await assert.rejects(new g11.FuryCubeG11Adapter(hw.hid).applyLighting(options), /compatível/);
  assert.equal(hw.writes.length, 0);
});

test('cancellation during preparation prevents the second G11 report and closes the handle', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hw = fakeHardware();
  let cancelled = false;
  const operation = new g11.FuryCubeG11Adapter(hw.hid).applyLighting(options, { isCancelled: () => cancelled });
  const rejection = assert.rejects(operation, /cancelad/i);
  await Promise.resolve();
  cancelled = true;
  t.mock.timers.tick(500);
  await rejection;
  assert.equal(hw.writes.length, 1);
  assert.equal(hw.closes, 1);
});

test('closes the handle and stops on a partial report', async () => {
  let closes = 0;
  const hid = { devices: () => [feature], HID: class {
    sendFeatureReport() { return 12; }
    close() { closes++; }
  } };
  await assert.rejects(new g11.FuryCubeG11Adapter(hid).applyLighting(options), /134/);
  assert.equal(closes, 1);
});

test('the mouse target routes G11 lighting without a keyboard write', async (t) => {
  t.mock.method(AttackSharkX11Adapter.prototype, 'probe', () => null);
  t.mock.method(WomierSK80Adapter.prototype, 'probe', () => { assert.fail('Must not probe keyboard'); });
  t.mock.method(g11.FuryCubeG11Adapter.prototype, 'probe', () => ({ adapterId: 'furycube-g11', name: 'FuryCube G11', lightingEffects: ['estatico'] }));
  let applied;
  t.mock.method(g11.FuryCubeG11Adapter.prototype, 'applyLighting', async (request) => { applied = request; return { written: 268, reports: 2 }; });
  const result = await new HardwareService().applyLighting(options);
  assert.deepEqual(applied, { ...options, speed: 55 });
  assert.deepEqual(result.devices, [{ id: 'furycube-g11', name: 'FuryCube G11', written: 268, reports: 2, responses: 0 }]);
});
