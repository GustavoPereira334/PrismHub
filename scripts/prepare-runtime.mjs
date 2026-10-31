import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vendor = path.join(root, 'vendor');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'packaging/runtime-manifest.json')));
if (process.platform !== 'win32') throw new Error('Prepare o pacote Windows em Windows x64.');
await fs.mkdir(path.join(vendor, 'downloads'), { recursive: true });
const paths = {};
for (const [key, asset] of Object.entries(manifest)) {
  if (!/^[a-f0-9]{64}$/.test(asset.sha256) || path.basename(asset.file) !== asset.file) throw new Error('Manifesto de runtime inválido.');
  const dest = path.join(vendor, 'downloads', asset.file);
  let bytes;
  try { bytes = await fs.readFile(dest); } catch {}
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
    console.log(`Obtendo ${asset.file} da origem oficial...`);
    const response = await fetch(asset.url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${asset.file}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`SHA256 inválido: ${asset.file}`);
    await fs.writeFile(dest, bytes);
  }
  paths[key] = dest;
}
const quoted = paths.pawnio.replaceAll("'", "''");
const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `$ErrorActionPreference='Stop'; Import-Module "$PSHOME/Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1"; $s=Get-AuthenticodeSignature -LiteralPath '${quoted}'; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'CN=namazso.eu'){exit 1}; Write-Output 'PawnIO signature valid'`], { windowsHide: true });
console.log(stdout.trim());
await fs.mkdir(path.join(vendor, 'staging'), { recursive: true });
await exec('tar.exe', ['-xf', paths.openrgb, '-C', path.join(vendor, 'staging')]);
await fs.cp(path.join(vendor, 'staging/OpenRGB Windows 64-bit'), path.join(vendor, 'openrgb'), { recursive: true });
await fs.mkdir(path.join(vendor, 'drivers'), { recursive: true });
await fs.copyFile(paths.pawnio, path.join(vendor, 'drivers/PawnIO_setup.exe'));
await fs.mkdir(path.join(vendor, 'licensing/sources'), { recursive: true });
for (const key of ['source', 'qtbase', 'qt5compat', 'libusb', 'hidapi']) await fs.copyFile(paths[key], path.join(vendor, 'licensing/sources', path.basename(paths[key])));
await exec('tar.exe', ['-xf', paths.source, '-C', path.join(vendor, 'licensing'), 'openrgb/LICENSE', 'openrgb/README.md', 'openrgb/OpenRGB.pro', 'openrgb/.gitlab-ci.yml']);
await fs.copyFile(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(vendor, 'licensing/THIRD_PARTY_NOTICES.md'));
await fs.cp(path.join(root, 'packaging/licenses'), path.join(vendor, 'licensing'), { recursive: true });
await fs.copyFile(path.join(root, 'packaging/runtime-manifest.json'), path.join(vendor, 'licensing/runtime-manifest.json'));
console.log('Motor, driver assinado, licenças e fontes preparados.');
