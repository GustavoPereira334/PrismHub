import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCapabilities, normalizeDevice, validateLightingRequest, validateMouseRequest } from '../src/shared/contracts.js';

test('lighting rejects unknown properties rather than silently accepting hardware flags', () => {
  const request = { target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' };
  for (const key of ['nativePath', 'rawReport', 'acceptExperimentalRisk', '__proto__']) {
    const value = { ...request };
    Object.defineProperty(value, key, { value: true, enumerable: true });
    assert.throws(() => validateLightingRequest(value), /inválid/i);
  }
});

test('mouse contract bounds values, rejects arbitrary reports and enforces one operation', () => {
  assert.deepEqual(validateMouseRequest({ deviceId: 'USB\\VID_1D57&PID_FA60', dpi: 1600 }), { deviceId: 'USB\\VID_1D57&PID_FA60', dpi: 1600 });
  for (const request of [{ deviceId: 'hid:furycube-g11', dpi: 1600 }, { deviceId: 'hid:mouse', pollingRate: 1000 }, { deviceId: 'hid:mouse', profileSlot: 0 }]) assert.deepEqual(validateMouseRequest(request), request);
  for (const request of [null, [], { deviceId: 'mouse' }, { deviceId: 'mouse', dpi: 800, pollingRate: 1000 }, { deviceId: 'mouse', dpi: 801 }, { deviceId: 'mouse', pollingRate: 999 }, { deviceId: 'mouse', profileSlot: 5 }, { deviceId: 'mouse', dpi: 800, rawReport: [0] }]) assert.throws(() => validateMouseRequest(request));
});

test('normalizes a Windows device without inventing capabilities', () => {
  const device = normalizeDevice({ id: 'USB\\VID_1234&PID_ABCD', name: 'USB Microphone', category: 'audio' });
  assert.equal(device.name, 'USB Microphone');
  assert.equal(device.vid, null);
  assert.equal(device.pid, null);
  assert.equal(device.state, 'detected');
  assert.deepEqual(device.capabilities, emptyCapabilities());
});

test('rejects unknown states and preserves explicit identifiers', () => {
  const device = normalizeDevice({ id: 'id-1', name: 'Keyboard', vid: 'abcd', pid: '1234', state: 'connected' });
  assert.equal(device.vid, 'ABCD');
  assert.equal(device.pid, '1234');
  assert.equal(device.state, 'detected');
});

test('preserves adapter matches as candidates without renaming the Windows device', () => {
  const device = normalizeDevice({
    id: 'USB\\VID_1D57&PID_FA60',
    name: 'USB Receiver',
    vid: '1d57',
    pid: 'fa60',
    adapterCandidates: [{ id: 'furycube-g11', label: 'FuryCube G11', basis: 'vid-pid' }]
  });

  assert.equal(device.name, 'USB Receiver');
  assert.deepEqual(device.adapterCandidates, [
    { id: 'furycube-g11', label: 'FuryCube G11', basis: 'vid-pid', confidence: 'candidate' }
  ]);
  assert.equal(device.state, 'detected');
  assert.equal(device.capabilities.lighting, false);
});
