import { capabilityKeys, deviceStates } from '../shared/contracts.js';

const knownAdapters = new Set(['furycube-g11', 'openrgb']);
const states = new Set(['idle', 'connected', 'connecting', 'disconnected', 'unavailable', 'ready', 'starting', 'stopped']);
const state = value => states.has(value) ? value : 'unavailable';
export function buildDiagnostics({ version, devices, status, logs = {} }) {
  return {
    schemaVersion: 1, createdAt: new Date().toISOString(), version: /^\d+\.\d+\.\d+$/.test(version) ? version : 'unknown',
    platform: process.platform, arch: process.arch,
    services: { worker: state(status?.worker?.state), discovery: state(status?.discovery?.state), openrgb: state(status?.openrgb?.state), writeUncertain: status?.worker?.writeUncertain === true },
    logs: { failures: Number.isSafeInteger(logs.failures) ? logs.failures : 0, dropped: Number.isSafeInteger(logs.dropped) ? logs.dropped : 0 },
    devices: (Array.isArray(devices) ? devices : []).slice(0, 512).map((device, index) => ({
      reference: `device-${index + 1}`,
      vid: /^[0-9a-f]{4}$/i.test(device.vid) ? device.vid : null,
      pid: /^[0-9a-f]{4}$/i.test(device.pid) ? device.pid : null,
      category: ['audio', 'input', 'usb', 'internal', 'other', 'mouse', 'keyboard'].includes(device.category) ? device.category : 'other',
      state: deviceStates.includes(device.state) ? device.state : 'detected',
      adapter: knownAdapters.has(device.controllerId) ? device.controllerId : null,
      capabilities: Object.fromEntries(capabilityKeys.map(key => [key, device.capabilities?.[key] === true])),
      reasons: {
        lighting: device.capabilities?.lighting === true ? 'Adaptador RGB disponível; confirmação visual continua necessária.' : 'Nenhum adaptador com controle RGB confirmado nesta rota.',
        dpi: 'Sem protocolo de DPI validado fisicamente.',
        pollingRate: 'Sem protocolo de polling validado fisicamente.',
        onboardProfiles: 'Sem protocolo de perfis embarcados validado fisicamente.'
      }
    }))
  };
}
