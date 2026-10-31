import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

function child() {
  const worker = new EventEmitter();
  worker.killed = false;
  worker.kill = () => { worker.killed = true; worker.emit('exit', 1); return true; };
  worker.postMessage = message => {
    if (message.method === 'start' || message.method === 'refresh') queueMicrotask(() => worker.emit('message', { id: message.id, result: { devices: [], status: { discovery: { state: 'connected' }, openrgb: { state: 'disconnected' } } } }));
  };
  return worker;
}

test('a stuck hardware child is killed without blocking the parent or retrying writes', async () => {
  const { HardwareProcess } = await import('../src/modules/hardwareProcess.js');
  const children = [];
  const hardware = new HardwareProcess({ spawnWorker: () => { const c = child(); children.push(c); return c; }, timeoutMs: 35 });
  await hardware.start();
  let parentResponsive = false;
  setImmediate(() => { parentResponsive = true; });
  await assert.rejects(hardware.applyLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }), /incerto/i);
  assert.equal(parentResponsive, true);
  assert.equal(children[0].killed, true);
  assert.equal(children.length, 1);
  assert.equal(hardware.status().worker.state, 'unavailable');
  assert.deepEqual(hardware.list(), []);
  await hardware.refresh();
  assert.equal(children.length, 2);
  hardware.stop();
  assert.equal(children[1].killed, true);
});

test('a replacement child cannot start until termination of the old child is confirmed', async () => {
  const { HardwareProcess } = await import('../src/modules/hardwareProcess.js');
  const worker = child(); let spawns = 0;
  worker.kill = () => false;
  const hardware = new HardwareProcess({ spawnWorker: () => { spawns++; return worker; }, timeoutMs: 35 });
  await hardware.start();
  await assert.rejects(hardware.applyLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }));
  await assert.rejects(hardware.refresh());
  assert.equal(spawns, 1);
  worker.emit('exit', 1);
});

test('stop rejects outstanding operations and late child replies cannot revive capabilities', async () => {
  const { HardwareProcess } = await import('../src/modules/hardwareProcess.js');
  const worker = child();
  const hardware = new HardwareProcess({ spawnWorker: () => worker });
  await hardware.start();
  const operation = hardware.applyLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' });
  const rejected = assert.rejects(operation, /incerto|cancelad/i);
  hardware.stop();
  worker.emit('message', { event: 'devices-updated', payload: [{ id: 'stale', capabilities: { lighting: true } }] });
  await rejected;
  assert.deepEqual(hardware.list(), []);
});

test('a process termination error cannot escape into the parent event loop', async t => {
  const { HardwareProcess } = await import('../src/modules/hardwareProcess.js');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const worker = child(); worker.kill = () => { throw Error('OS refused'); };
  const hardware = new HardwareProcess({ spawnWorker: () => worker, timeoutMs: 35 });
  await hardware.start();
  const rejection = assert.rejects(hardware.applyLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }));
  assert.doesNotThrow(() => t.mock.timers.tick(35));
  await rejection;
  worker.emit('exit', 1);
});
