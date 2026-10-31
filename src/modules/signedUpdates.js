import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdir, mkdtemp, open, rm, rmdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const MAX_ARTIFACT = 512 * 1024 * 1024;
const validVersion = v => typeof v === 'string' && /^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(v);
function compare(a, b) { const x = a.split('.').map(Number), y = b.split('.').map(Number); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]; }
function httpsUrl(value) { const url = new URL(value); if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Endereço de atualização inválido.'); return url; }
function configured(trust) {
  try { return trust?.enabled === true && !!httpsUrl(trust.manifestUrl) && createPublicKey(trust.publicKeyPem).asymmetricKeyType === 'ed25519' && typeof trust.publisherSubject === 'string' && trust.publisherSubject.length > 0; }
  catch { return false; }
}
export function verifyUpdateEnvelope(envelope, trust, currentVersion, now = Date.now()) {
  if (!configured(trust) || !validVersion(currentVersion) || !envelope || Object.keys(envelope).sort().join(',') !== 'manifest,signature' ||
      typeof envelope.manifest !== 'string' || envelope.manifest.length > 65536 || typeof envelope.signature !== 'string' || envelope.signature.length > 100) throw new Error('Manifesto de atualização inválido.');
  const body = Buffer.from(envelope.manifest, 'base64'), signature = Buffer.from(envelope.signature, 'base64');
  if (signature.length !== 64 || body.toString('base64') !== envelope.manifest || !verify(null, body, trust.publicKeyPem, signature)) throw new Error('Assinatura do manifesto inválida.');
  const manifest = JSON.parse(body);
  if (!manifest || Object.keys(manifest).sort().join(',') !== 'arch,expiresAt,issuedAt,platform,sha256,size,url,version' ||
      !validVersion(manifest.version) || compare(manifest.version, currentVersion) < 0 || manifest.platform !== 'win32' || manifest.arch !== 'x64' ||
      !Number.isSafeInteger(manifest.issuedAt) || !Number.isSafeInteger(manifest.expiresAt) || manifest.issuedAt > now || manifest.expiresAt <= now || manifest.expiresAt - manifest.issuedAt > 7 * 86400000 ||
      !Number.isSafeInteger(manifest.size) || manifest.size < 1 || manifest.size > MAX_ARTIFACT || !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      httpsUrl(manifest.url).origin !== httpsUrl(trust.manifestUrl).origin) throw new Error('Manifesto incompatível, expirado ou não permitido.');
  return manifest;
}
async function readLimited(response, limit) {
  if (!response.ok || !response.body) throw new Error('Falha ao obter atualização.');
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw new Error('Resposta de atualização excede o limite.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function verifyAuthenticode(file, publisherSubject) {
  if (process.platform !== 'win32') throw new Error('Instalação disponível somente no Windows.');
  const script = "$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath $env:PRISMHUB_UPDATE_FILE; if ($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -cne $env:PRISMHUB_UPDATE_PUBLISHER) { throw 'Assinatura de publicador inválida' }";
  await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, timeout: 15000, maxBuffer: 8192,
    env: { ...process.env, PRISMHUB_UPDATE_FILE: file, PRISMHUB_UPDATE_PUBLISHER: publisherSubject }
  });
}
export async function launchVerifiedInstaller(file, { publisherSubject, sha256, size }) {
  if (process.platform !== 'win32') throw new Error('Instalação disponível somente no Windows.');
  // Deny writes/deletion while hashing, checking Authenticode and starting the image.
  // No untrusted strings are interpolated into PowerShell source.
  const script = `
$ErrorActionPreference='Stop'
$stream=[System.IO.File]::Open($env:PRISMHUB_UPDATE_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read)
try {
  if ($stream.Length -ne [long]$env:PRISMHUB_UPDATE_SIZE) { throw 'Invalid size' }
  $algorithm=[System.Security.Cryptography.SHA256]::Create()
  try { $digest=([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $algorithm.Dispose() }
  if ($digest -cne $env:PRISMHUB_UPDATE_HASH) { throw 'Invalid hash' }
  $signature=Get-AuthenticodeSignature -LiteralPath $env:PRISMHUB_UPDATE_FILE
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -cne $env:PRISMHUB_UPDATE_PUBLISHER) { throw 'Invalid publisher' }
  $installer=Start-Process -FilePath $env:PRISMHUB_UPDATE_FILE -Verb RunAs -WindowStyle Normal -PassThru
  if (-not $installer) { throw 'Installer did not start' }
} finally { $stream.Dispose() }
`;
  try {
    await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true, timeout: 120000, maxBuffer: 8192,
      env: { ...process.env, PRISMHUB_UPDATE_FILE: file, PRISMHUB_UPDATE_PUBLISHER: publisherSubject, PRISMHUB_UPDATE_HASH: sha256, PRISMHUB_UPDATE_SIZE: String(size) }
    });
  } catch { throw new Error('A instalação foi cancelada ou a verificação final do instalador falhou.'); }
}
async function hashFile(file) {
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of createReadStream(file)) { size += chunk.length; if (size > MAX_ARTIFACT) throw new Error('Arquivo de atualização inválido.'); hash.update(chunk); }
  return { size, sha256: hash.digest('hex') };
}

// Trust is fixed by the build; renderer messages never provide URLs, keys or executable paths.
export class SignedUpdates {
  #trust; #version; #directory; #fetch; #verify; #launch; #available = null; #staged = null; #busy = false;
  constructor({ trust, version, directory, fetcher = fetch, verifyPublisher = verifyAuthenticode, launch = async () => { throw new Error('Instalação não configurada.'); } }) {
    this.#trust = structuredClone(trust); this.#version = version; this.#directory = directory;
    this.#fetch = fetcher; this.#verify = verifyPublisher; this.#launch = launch;
  }
  status() { return configured(this.#trust) ? { state: 'ready', message: 'Verificação de atualizações assinadas disponível.' } : { state: 'unconfigured', message: 'Atualizações bloqueadas: faltam endereço oficial, chave pública e publicador certificado.' }; }
  async #exclusive(work) {
    if (this.#busy) throw new Error('Aguarde a operação de atualização em andamento.');
    this.#busy = true;
    try { return await work(); } finally { this.#busy = false; }
  }
  check() {
    return this.#exclusive(async () => {
      this.#available = null;
      if (!configured(this.#trust)) return this.status();
      const response = await this.#fetch(this.#trust.manifestUrl, { redirect: 'error', signal: AbortSignal.timeout(10000) });
      const envelope = JSON.parse(await readLimited(response, 65536));
      const manifest = verifyUpdateEnvelope(envelope, this.#trust, this.#version);
      if (compare(manifest.version, this.#version) === 0) return { state: 'current', message: 'A versão instalada é a versão anunciada.' };
      this.#available = { envelope, manifest };
      return { state: 'available', version: manifest.version, message: 'Atualização assinada disponível.' };
    });
  }
  stage() {
    return this.#exclusive(async () => {
      if (!this.#available || !this.#directory) throw new Error('Verifique uma atualização assinada antes de baixar.');
      const { envelope } = this.#available;
      const manifest = verifyUpdateEnvelope(envelope, this.#trust, this.#version);
      await mkdir(this.#directory, { recursive: true });
      const directory = await mkdtemp(path.join(this.#directory, 'verified-'));
      const file = path.join(directory, 'PrismHub-Setup.exe');
      try {
        const response = await this.#fetch(manifest.url, { redirect: 'error', signal: AbortSignal.timeout(120000) });
        if (!response.ok || !response.body) throw new Error('Falha ao baixar atualização.');
        const output = await open(file, 'wx', 0o600), hash = createHash('sha256'); let size = 0;
        try {
          for await (const chunk of response.body) {
            size += chunk.length; if (size > manifest.size) throw new Error('Tamanho da atualização inválido.');
            hash.update(chunk); await output.writeFile(chunk);
          }
          await output.sync();
        } finally { await output.close(); }
        if (size !== manifest.size || hash.digest('hex') !== manifest.sha256) throw new Error('Integridade da atualização inválida.');
        await this.#verify(file, this.#trust.publisherSubject);
        if (this.#staged) await this.#cleanup(this.#staged.file);
        this.#staged = { file, envelope };
        return { state: 'staged', version: manifest.version, message: 'Download e assinatura do publicador verificados. Pronto para instalar.' };
      } catch (error) { await this.#cleanup(file); throw error; }
    });
  }
  async #cleanup(file) { await rm(file, { force: true }).catch(() => {}); await rmdir(path.dirname(file)).catch(() => {}); }
  install() {
    return this.#exclusive(async () => {
      if (!this.#staged) throw new Error('Nenhuma atualização verificada está pronta.');
      const { file, envelope } = this.#staged;
      const manifest = verifyUpdateEnvelope(envelope, this.#trust, this.#version);
      const actual = await hashFile(file);
      if (actual.size !== manifest.size || actual.sha256 !== manifest.sha256) throw new Error('O instalador foi alterado após o download.');
      await this.#verify(file, this.#trust.publisherSubject);
      await this.#launch(file, { publisherSubject: this.#trust.publisherSubject, sha256: manifest.sha256, size: manifest.size });
      this.#staged = null;
      return { state: 'installing', message: 'Instalador verificado iniciado.' };
    });
  }
}
