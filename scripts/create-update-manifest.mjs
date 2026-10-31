import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, createPrivateKey, sign } from 'node:crypto';
import path from 'node:path';
import { verifyUpdateEnvelope, verifyAuthenticode } from '../src/modules/signedUpdates.js';

// Publisher tool only. Keys/certificates never enter application resources or logs.
try {
  const [artifact, version, url] = process.argv.slice(2);
  if (!artifact || !version || !url || !process.env.PRISMHUB_UPDATE_PRIVATE_KEY_FILE) throw new Error('Uso: npm run release:manifest -- <instalador.exe> <versão> <URL HTTPS>. Configure PRISMHUB_UPDATE_PRIVATE_KEY_FILE; a chave privada não deve ser distribuída.');
  const trust = JSON.parse(await readFile(new URL('../src/config/update-trust.json', import.meta.url), 'utf8'));
  const file = path.resolve(artifact);
  await verifyAuthenticode(file, trust.publisherSubject);
  const size = (await stat(file)).size;
  if (size < 1 || size > 512 * 1024 * 1024) throw new Error('Instalador fora do limite.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  const issuedAt = Date.now();
  const manifest = { version, platform: 'win32', arch: 'x64', issuedAt, expiresAt: issuedAt + 7 * 86400000, url, size, sha256: hash.digest('hex') };
  const bytes = Buffer.from(JSON.stringify(manifest));
  const key = createPrivateKey({ key: await readFile(process.env.PRISMHUB_UPDATE_PRIVATE_KEY_FILE), passphrase: process.env.PRISMHUB_UPDATE_KEY_PASSPHRASE });
  const envelope = { manifest: bytes.toString('base64'), signature: sign(null, bytes, key).toString('base64') };
  verifyUpdateEnvelope(envelope, trust, '0.0.0', issuedAt);
  const output = new URL('../dist/update-manifest.json', import.meta.url);
  await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify(envelope, null, 2));
  console.log('Manifesto assinado criado em dist/update-manifest.json. Nenhum arquivo foi publicado.');
} catch { console.error('Não foi possível gerar o manifesto. Confira argumentos, configuração de confiança, assinatura do instalador e chave de publicação.'); process.exitCode = 1; }
