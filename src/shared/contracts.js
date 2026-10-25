export const capabilityKeys = [
  'lighting', 'lightingZones', 'battery', 'temperature', 'fanSpeed', 'pumpSpeed',
  'dpi', 'pollingRate', 'keyRemapping', 'macros', 'audioVolume', 'microphoneGain',
  'mute', 'firmwareVersion', 'screen', 'onboardProfiles'
];

export const deviceStates = ['detected', 'partially-supported', 'controllable', 'certified', 'experimental', 'unsupported', 'disconnected', 'error'];

export function emptyCapabilities() {
  return Object.fromEntries(capabilityKeys.map((key) => [key, false]));
}

function normalizeAdapterCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .filter((candidate) => candidate && candidate.id && candidate.label)
    .map((candidate) => ({
      id: String(candidate.id),
      label: String(candidate.label),
      basis: candidate.basis ? String(candidate.basis) : 'unknown',
      confidence: 'candidate'
    }));
}

export function normalizeDevice(device) {
  return {
    id: String(device.id ?? ''),
    name: String(device.name || 'Dispositivo sem nome'),
    manufacturer: device.manufacturer ? String(device.manufacturer) : null,
    vid: device.vid ? String(device.vid).toUpperCase() : null,
    pid: device.pid ? String(device.pid).toUpperCase() : null,
    connection: device.connection ? String(device.connection) : 'unknown',
    category: device.category ? String(device.category) : 'other',
    state: deviceStates.includes(device.state) ? device.state : 'detected',
    capabilities: { ...emptyCapabilities(), ...(device.capabilities || {}) },
    adapterCandidates: normalizeAdapterCandidates(device.adapterCandidates),
    lastSeen: device.lastSeen ? String(device.lastSeen) : new Date().toISOString()
  };
}
