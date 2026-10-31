import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeDevice } from '../shared/contracts.js';

const execFileAsync = promisify(execFile);
const powershell = process.platform === 'win32' ? 'powershell.exe' : null;

const knownCandidates = new Map([
  ['1D57:FA60', { id: 'furycube-g11', label: 'FuryCube G11', basis: 'vid-pid' }],
  ['05AC:024F', { id: 'womier-sk80', label: 'Womier SK80 (candidato)', basis: 'vid-pid' }],
]);

const command = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$devices = @()
$devices += @(Get-PnpDevice -PresentOnly | Where-Object {
  ([string]$_.InstanceId -match '^USB\\\\' -and [string]$_.InstanceId -notmatch '&MI_[0-9A-F]{2}')
} | ForEach-Object {
  $id = [string]$_.InstanceId
  $vendorId = $null; $productId = $null
  if ($id -match 'VID_([0-9A-F]{4})') { $vendorId = $Matches[1] }
  if ($id -match 'PID_([0-9A-F]{4})') { $productId = $Matches[1] }
  $category = switch -Regex ([string]$_.Class) {
    'AudioEndpoint|MEDIA' { 'audio'; break }
    'HIDClass|Keyboard|Mouse' { 'input'; break }
    'USB' { 'usb'; break }
    default { 'other' }
  }
  [pscustomobject]@{ id=$id; name=[string]$_.FriendlyName; manufacturer=[string]$_.Manufacturer; vid=$vendorId; pid=$productId; connection='windows'; category=$category; state='detected' }
})
$devices += @(Get-CimInstance Win32_SoundDevice -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{ id=[string]$_.DeviceID; name=[string]$_.Name; manufacturer=[string]$_.Manufacturer; vid=$null; pid=$null; connection='audio'; category='audio'; state='detected' }
})
$devices | ConvertTo-Json -Compress -Depth 4
`;

export async function discoverWindowsDevices() {
  if (!powershell) return [];
  const { stdout } = await execFileAsync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  const unique = new Map();
  list.filter((device) => device.id && device.name).forEach((device) => {
    const identifiers = String(device.id).match(/VID_([0-9A-F]{4}).*PID_([0-9A-F]{4})/i);
    if (!device.vid && identifiers) device.vid = identifiers[1];
    if (!device.pid && identifiers) device.pid = identifiers[2];
    const key = device.vid && device.pid ? `${String(device.vid).toUpperCase()}:${String(device.pid).toUpperCase()}` : null;
    const candidate = key ? knownCandidates.get(key) : null;
    if (candidate) device.adapterCandidates = [candidate];
    const normalized = normalizeDevice(device);
    if ((!normalized.vid || !normalized.pid) && normalized.category !== 'audio') return;
    const uniqueKey = normalized.vid && normalized.pid ? `${normalized.vid}:${normalized.pid}` : normalized.id;
    const previous = unique.get(uniqueKey);
    const genericName = /^(USB Composite Device|Dispositivo de áudio USB|Dispositivo USB)$/i;
    if (!previous || genericName.test(previous.name) || (previous.category === 'usb' && normalized.category === 'audio')) unique.set(uniqueKey, normalized);
  });
  return [...unique.values()];
}
