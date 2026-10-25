import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyCapabilities, normalizeDevice } from '../src/shared/contracts.js';

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
    adapterCandidates: [{ id: 'attack-shark-x11', label: 'Attack Shark X11', basis: 'vid-pid' }]
  });

  assert.equal(device.name, 'USB Receiver');
  assert.deepEqual(device.adapterCandidates, [
    { id: 'attack-shark-x11', label: 'Attack Shark X11', basis: 'vid-pid', confidence: 'candidate' }
  ]);
  assert.equal(device.state, 'detected');
  assert.equal(device.capabilities.lighting, false);
});
