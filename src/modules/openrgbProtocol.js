// SDK v3 wire format, independently implemented from the official OpenRGB SDK documentation.
export const SDK_VERSION = 3;
export const MAX_PACKET_SIZE = 8 * 1024 * 1024;
export const isInternalController = (controller) => [0, 1, 2, 3, 4, 14, 15].includes(controller.type);
export const controllerTarget = controller => isInternalController(controller) ? 'internal' : controller.type === 5 ? 'keyboard' : controller.type === 6 ? 'mouse' : null;
export function selectLightingControllers(controllers, target = 'all', excludeTargets = []) {
  return controllers.filter(controller => {
    const route = controllerTarget(controller);
    return route !== null && !excludeTargets.includes(route) && (target === 'all' || target === route);
  });
}

function uint32(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new TypeError('Inteiro SDK inválido.');
  return value;
}
export function encodePacket(id, device = 0, payload = Buffer.alloc(0)) {
  if (!Buffer.isBuffer(payload) || payload.length > MAX_PACKET_SIZE) throw new TypeError('Pacote SDK excede o limite.');
  const header = Buffer.alloc(16);
  header.write('ORGB');
  header.writeUInt32LE(uint32(device), 4);
  header.writeUInt32LE(uint32(id), 8);
  header.writeUInt32LE(payload.length, 12);
  return Buffer.concat([header, payload]);
}

export class PacketDecoder {
  #buffer = Buffer.alloc(0);
  push(chunk) {
    if (!Buffer.isBuffer(chunk) || this.#buffer.length + chunk.length > 2 * (MAX_PACKET_SIZE + 16)) throw new Error('Resposta SDK excede o limite.');
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const packets = [];
    while (this.#buffer.length >= 16) {
      if (this.#buffer.toString('ascii', 0, 4) !== 'ORGB') throw new Error('Cabeçalho ORGB inválido.');
      const size = this.#buffer.readUInt32LE(12);
      if (size > MAX_PACKET_SIZE) throw new Error('Pacote SDK excede o limite.');
      if (this.#buffer.length < 16 + size) break;
      packets.push({ id: this.#buffer.readUInt32LE(8), device: this.#buffer.readUInt32LE(4), payload: Buffer.from(this.#buffer.subarray(16, 16 + size)) });
      this.#buffer = this.#buffer.subarray(16 + size);
    }
    return packets;
  }
}

class Reader {
  offset = 0;
  constructor(buffer) { this.buffer = buffer; }
  take(size) {
    if (!Number.isInteger(size) || size < 0 || this.offset + size > this.buffer.length) throw new Error('Descrição SDK truncada.');
    const value = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return value;
  }
  u16() { return this.take(2).readUInt16LE(); }
  u32() { return this.take(4).readUInt32LE(); }
  string() {
    const size = this.u16();
    if (size < 1 || size > 8192) throw new Error('String SDK fora do limite.');
    const bytes = this.take(size);
    if (bytes[size - 1] !== 0) throw new Error('String SDK sem terminação.');
    return bytes.toString('utf8', 0, size - 1);
  }
}

export function parseController(payload, index) {
  const r = new Reader(payload);
  if (r.u32() !== payload.length) throw new Error('Tamanho da descrição SDK inválido.');
  const controller = { index, type: r.u32(), name: r.string(), vendor: r.string(), description: r.string(), version: r.string(), serial: r.string(), location: r.string() };
  const modeCount = r.u16();
  if (modeCount > 256) throw new Error('Quantidade de modos SDK fora do limite.');
  controller.activeMode = r.u32();
  controller.modes = [];
  for (let i = 0; i < modeCount; i += 1) {
    const mode = { name: r.string(), value: r.u32(), flags: r.u32() };
    for (const key of ['speedMin', 'speedMax', 'brightnessMin', 'brightnessMax', 'colorsMin', 'colorsMax', 'speed', 'brightness', 'direction', 'colorMode']) mode[key] = r.u32();
    const colors = r.u16();
    r.take(colors * 4);
    controller.modes.push(mode);
  }
  const zoneCount = r.u16();
  if (zoneCount > 1024) throw new Error('Quantidade de zonas SDK fora do limite.');
  controller.zones = [];
  for (let i = 0; i < zoneCount; i += 1) {
    const zone = { name: r.string(), type: r.u32(), ledsMin: r.u32(), ledsMax: r.u32(), ledCount: r.u32() };
    const matrixLength = r.u16();
    if (matrixLength) {
      const matrix = r.take(matrixLength);
      if (matrixLength < 8 || 8 + matrix.readUInt32LE(0) * matrix.readUInt32LE(4) * 4 !== matrixLength) throw new Error('Matriz SDK inválida.');
    }
    controller.zones.push(zone);
  }
  controller.ledCount = r.u16();
  for (let i = 0; i < controller.ledCount; i += 1) { r.string(); r.u32(); }
  controller.colorCount = r.u16();
  r.take(controller.colorCount * 4);
  if (r.offset !== payload.length) throw new Error('Dados extras na descrição SDK.');
  controller.supportsStatic = controller.colorCount > 0 && controller.colorCount === controller.ledCount &&
    controller.modes.some((mode) => mode.name.toLowerCase() === 'direct' && (mode.flags & 32) !== 0);
  return controller;
}

export function encodeColorUpdate(count, rgb) {
  if (!Number.isInteger(count) || count < 1 || count > 65535 || !Array.isArray(rgb) || rgb.length !== 3 || rgb.some(c => !Number.isInteger(c) || c < 0 || c > 255)) throw new TypeError('Cores SDK inválidas.');
  const payload = Buffer.alloc(6 + count * 4);
  payload.writeUInt32LE(payload.length);
  payload.writeUInt16LE(count, 4);
  for (let i = 0; i < count; i += 1) payload.set(rgb, 6 + i * 4);
  return payload;
}
