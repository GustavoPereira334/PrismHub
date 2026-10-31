import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const keys = generateKeyPairSync('ed25519');
const trust = { enabled: true, manifestUrl: 'https://updates.example.test/manifest.json', publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }), publisherSubject: 'CN=Test Publisher' };
const artifact = Buffer.from('inert test bytes, not executable');
const manifest = () => ({ version: '0.2.0', platform: 'win32', arch: 'x64', issuedAt: Date.now() - 1000, expiresAt: Date.now() + 60000, url: 'https://updates.example.test/setup.exe', size: artifact.length, sha256: createHash('sha256').update(artifact).digest('hex') });
function envelope(value) { const body = Buffer.from(JSON.stringify(value)); return { manifest: body.toString('base64'), signature: sign(null, body, keys.privateKey).toString('base64') }; }

test('update metadata requires a pinned signature, origin, lifetime and newer compatible version', async () => {
  const { verifyUpdateEnvelope } = await import('../src/modules/signedUpdates.js');
  assert.equal(verifyUpdateEnvelope(envelope(manifest()), trust, '0.1.0').version, '0.2.0');
  for (const change of [{ url: 'http://updates.example.test/a.exe' }, { url: 'https://evil.test/a.exe' }, { expiresAt: Date.now() - 1 }, { version: '0.0.1' }, { arch: 'arm64' }, { size: 1e12 }]) assert.throws(() => verifyUpdateEnvelope(envelope({ ...manifest(), ...change }), trust, '0.1.0'));
  const altered = envelope(manifest());
  altered.manifest = Buffer.from(JSON.stringify({ ...manifest(), version: '9.0.0' })).toString('base64');
  assert.throws(() => verifyUpdateEnvelope(altered, trust, '0.1.0'));
});

test('unconfigured updates make no network calls', async () => {
  const { SignedUpdates } = await import('../src/modules/signedUpdates.js');
  const updates = new SignedUpdates({ trust: { enabled: false }, version: '0.1.0', fetcher: () => assert.fail('No network') });
  assert.equal((await updates.check()).state, 'unconfigured');
  await assert.rejects(updates.stage());
  await assert.rejects(updates.install());
});

test('staged updates require hash and Authenticode checks, including again immediately before launch', async t => {
  const { SignedUpdates } = await import('../src/modules/signedUpdates.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-updates-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let signatureChecks = 0, launched = false, stagedPath;
  const updates = new SignedUpdates({ trust, version: '0.1.0', directory,
    fetcher: async url => new Response(url.endsWith('manifest.json') ? JSON.stringify(envelope(manifest())) : artifact),
    verifyPublisher: async file => { signatureChecks++; stagedPath = file; },
    launch: async () => { launched = true; } });
  assert.equal((await updates.check()).state, 'available');
  assert.equal((await updates.stage()).state, 'staged');
  await writeFile(stagedPath, 'tampered bytes');
  await assert.rejects(updates.install());
  assert.equal(launched, false);
  assert.equal(signatureChecks, 1);
});

test('a verified update reaches only the fixed launcher with signed metadata and is consumed once', async t => {
  const { SignedUpdates } = await import('../src/modules/signedUpdates.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-good-update-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let verified = 0, launched = 0;
  const updates = new SignedUpdates({ trust, version: '0.1.0', directory,
    fetcher: async url => new Response(url.endsWith('manifest.json') ? JSON.stringify(envelope(manifest())) : artifact),
    verifyPublisher: async () => { verified++; },
    launch: async (file, metadata) => { assert.equal(path.basename(file), 'PrismHub-Setup.exe'); assert.equal(metadata.publisherSubject, trust.publisherSubject); assert.equal(metadata.size, artifact.length); launched++; } });
  await updates.check(); await updates.stage();
  assert.equal((await updates.install()).state, 'installing');
  assert.equal(verified, 2); assert.equal(launched, 1);
  await assert.rejects(updates.install());
});

test('an invalid publisher blocks staging and never launches an installer', async t => {
  const { SignedUpdates } = await import('../src/modules/signedUpdates.js');
  const directory = await mkdtemp(path.join(tmpdir(), 'prismhub-bad-publisher-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const updates = new SignedUpdates({ trust, version: '0.1.0', directory,
    fetcher: async url => new Response(url.endsWith('manifest.json') ? JSON.stringify(envelope(manifest())) : artifact),
    verifyPublisher: async () => { throw Error('Wrong publisher'); }, launch: async () => assert.fail('Must not launch') });
  await updates.check();
  await assert.rejects(updates.stage(), /publisher/i);
  await assert.rejects(updates.install());
});
