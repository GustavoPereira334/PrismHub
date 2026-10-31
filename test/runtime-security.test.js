import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

test('window security blocks subframe navigation, redirects and embedded webviews', async () => {
  const { secureWindow } = await import('../src/modules/electronSecurity.js');
  const contents = new EventEmitter();
  let open;
  contents.setWindowOpenHandler = handler => { open = handler; };
  secureWindow(contents);
  assert.deepEqual(open(), { action: 'deny' });
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    let blocked = false;
    contents.emit(name, { preventDefault: () => { blocked = true; } });
    assert.equal(blocked, true, name);
  }
});

test('session denies permissions, device permissions and downloads', async () => {
  const { secureSession } = await import('../src/modules/electronSecurity.js');
  const session = new EventEmitter();
  const handlers = {};
  for (const kind of ['PermissionRequest', 'PermissionCheck', 'DevicePermission']) session[`set${kind}Handler`] = handler => { handlers[kind] = handler; };
  secureSession(session);
  let granted;
  handlers.PermissionRequest(null, 'hid', value => { granted = value; });
  assert.equal(granted, false);
  assert.equal(handlers.PermissionCheck(), false);
  assert.equal(handlers.DevicePermission(), false);
  let blocked = false;
  session.emit('will-download', { preventDefault: () => { blocked = true; } });
  assert.equal(blocked, true);
});

test('audit logs rotate, omit private fields and survive filesystem failures', async t => {
  const { AuditLogger } = await import('../src/modules/auditLogger.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-audit-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logger = new AuditLogger({ directory, maxBytes: 512 });
  for (let n = 0; n < 20; n++) logger.record('ipc.completed', { channel: 'lighting:apply', sent: 1, nativePath: 'PRIVATE_PATH', serial: 'PRIVATE_SERIAL', message: 'PRIVATE_ERROR' });
  await logger.flush();
  assert.deepEqual((await readdir(directory)).sort(), ['audit.jsonl', 'audit.jsonl.1']);
  for (const file of await readdir(directory)) {
    const body = await readFile(path.join(directory, file), 'utf8');
    assert.doesNotMatch(body, /PRIVATE/);
    assert.ok(Buffer.byteLength(body) <= 512);
    for (const line of body.trim().split('\n')) assert.equal(JSON.parse(line).event, 'ipc.completed');
  }
  const broken = new AuditLogger({ directory: path.join(directory, 'audit.jsonl', 'not-a-directory') });
  broken.record('app.started', {});
  await broken.flush();
  assert.ok(broken.status().failures > 0);
});

test('audit queue is bounded under a renderer flood', async t => {
  const { AuditLogger } = await import('../src/modules/auditLogger.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-audit-flood-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const logger = new AuditLogger({ directory });
  for (let n = 0; n < 200; n++) logger.record('ipc.rejected', { channel: 'lighting:apply' });
  assert.equal(logger.status().dropped, 72);
  await logger.flush();
  assert.equal((await readFile(path.join(directory, 'audit.jsonl'), 'utf8')).trim().split('\n').length, 128);
});
