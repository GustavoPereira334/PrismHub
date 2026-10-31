export const API_VERSION = 1;
export const capabilityKeys = Object.freeze([
  'lighting', 'lightingZones', 'battery', 'temperature', 'fanSpeed', 'pumpSpeed',
  'dpi', 'pollingRate', 'keyRemapping', 'macros', 'audioVolume', 'microphoneGain',
  'mute', 'firmwareVersion', 'screen', 'onboardProfiles'
]);

function requireRecord(value, allowedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
      Reflect.ownKeys(value).some(key => !allowedKeys.includes(key))) {
    throw new TypeError('Parâmetros de configuração inválidos.');
  }
}

export function validateMouseRequest(request) {
  requireRecord(request, ['deviceId', 'dpi', 'pollingRate', 'profileSlot']);
  if (typeof request.deviceId !== 'string' || request.deviceId.length < 1 || request.deviceId.length > 256 || /[\u0000-\u001f\u007f]/.test(request.deviceId)) throw new TypeError('Identificador de dispositivo inválido.');
  const keys = ['dpi', 'pollingRate', 'profileSlot'].filter(key => Object.hasOwn(request, key));
  // A single operation avoids implying atomic multi-setting hardware writes.
  if (keys.length !== 1) throw new TypeError('Envie exatamente uma configuração de mouse.');
  const key = keys[0], value = request[key];
  if (!Number.isInteger(value) ||
      (key === 'dpi' && (value < 100 || value > 26000 || value % 100 !== 0)) ||
      (key === 'pollingRate' && ![125, 250, 500, 1000, 2000, 4000, 8000].includes(value)) ||
      (key === 'profileSlot' && (value < 0 || value > 4))) throw new TypeError('Valor de configuração de mouse inválido.');
  return { deviceId: request.deviceId, [key]: value };
}

export const deviceStates = ['detected', 'partially-supported', 'controllable', 'certified', 'experimental', 'unsupported', 'disconnected', 'error'];

export function validateLightingRequest(request) {
  requireRecord(request, ['target', 'color', 'brightness', 'effect', 'speed']);
  if (!request || typeof request !== 'object' || Array.isArray(request) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(request))) {
    throw new TypeError('Configuração de iluminação inválida.');
  }
  if (!['all', 'keyboard', 'mouse', 'internal'].includes(request.target)) throw new TypeError('Destino RGB inválido.');
  if (typeof request.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(request.color)) throw new TypeError('Cor inválida. Use o formato #RRGGBB.');
  if (!Number.isInteger(request.brightness) || request.brightness < 0 || request.brightness > 100) throw new TypeError('Brilho inválido.');
  if (!['estatico', 'pulso', 'onda', 'espectro'].includes(request.effect)) throw new TypeError('Efeito RGB inválido.');
  const speed = request.speed ?? 55;
  if (!Number.isInteger(speed) || speed < 0 || speed > 100) throw new TypeError('Velocidade inválida.');
  return { target: request.target, color: request.color.toUpperCase(), brightness: request.brightness, effect: request.effect, speed };
}

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
    capabilities: Object.fromEntries(capabilityKeys.map(key => [key, device.capabilities?.[key] === true])),
    adapterCandidates: normalizeAdapterCandidates(device.adapterCandidates),
    controllerId: device.controllerId ? String(device.controllerId) : null,
    lightingEffects: Array.isArray(device.lightingEffects) ? device.lightingEffects.map(String) : [],
    lightingTarget: ['keyboard', 'mouse', 'internal'].includes(device.lightingTarget) ? device.lightingTarget : null,
    lastSeen: device.lastSeen ? String(device.lastSeen) : new Date().toISOString()
  };
}
