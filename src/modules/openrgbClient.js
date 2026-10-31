import net from 'node:net';
import { EventEmitter } from 'node:events';
import { PacketDecoder, encodePacket, parseController, encodeColorUpdate, selectLightingControllers, SDK_VERSION } from './openrgbProtocol.js';
import { validateLightingRequest } from '../shared/contracts.js';

const versionPayload = () => { const data = Buffer.alloc(4); data.writeUInt32LE(SDK_VERSION); return data; };

function prepareMode(controller) {
  // This ENE revision was physically verified with Static; Direct accepted writes without changing its LEDs.
  if (controller.type !== 1 || controller.vendor !== 'ENE' || controller.name !== 'ENE DRAM' || controller.version !== 'AUDA0-E6K5-0101') return null;
  const index = controller.modes.findIndex(mode => mode.name === 'Static' && mode.value === 1 &&
    (mode.flags & 32) !== 0 && mode.colorMode === 1 && mode.colorsMin === 0 && mode.colorsMax === 0);
  if (index < 0) throw new Error('A memória ENE não anunciou o modo Static validado.');
  const mode = controller.modes[index];
  const name = Buffer.from(mode.name + '\0');
  const payload = Buffer.alloc(8 + 2 + name.length + 48 + 2);
  payload.writeUInt32LE(payload.length, 0); payload.writeInt32LE(index, 4);
  payload.writeUInt16LE(name.length, 8); name.copy(payload, 10);
  let offset = 10 + name.length;
  for (const key of ['value', 'flags', 'speedMin', 'speedMax', 'brightnessMin', 'brightnessMax', 'colorsMin', 'colorsMax', 'speed', 'brightness', 'direction', 'colorMode']) {
    payload.writeUInt32LE(mode[key], offset); offset += 4;
  }
  // SDK v3 per-LED mode: no mode-specific colors. UpdateMode never saves to device flash.
  payload.writeUInt16LE(0, offset);
  return payload;
}

export class OpenRGBClient extends EventEmitter {
  #port; #timeout; #socket = null; #connecting = null; #ready = false;
  #pending = null; #queue = Promise.resolve(); #controllers = []; #valid = false;
  #generation = 0; #intent = 0; #plans = new WeakMap();
  #status = { state: 'disconnected', message: 'OpenRGB desconectado.' };

  constructor({ host = '127.0.0.1', port = 6742, timeoutMs = 1500 } = {}) {
    super();
    if (host !== '127.0.0.1') throw new TypeError('OpenRGB deve usar o serviço local.');
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 30000) throw new TypeError('Configuração SDK inválida.');
    this.#port = port; this.#timeout = timeoutMs;
  }

  status() { return structuredClone(this.#status); }
  listControllers() { return structuredClone(this.#controllers); }
  #setStatus(state, message) { this.#status = { state, message }; this.emit('status', this.status()); }
  #invalidate() { this.#generation += 1; this.#valid = false; this.#controllers = []; this.emit('devices-updated', []); }
  #fail(error, socket = this.#socket) {
    if (!socket || socket !== this.#socket) return;
    this.#socket = null; this.#ready = false;
    const pending = this.#pending; this.#pending = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(error); }
    socket.destroy(); this.#invalidate();
    this.#setStatus('unavailable', error.message || 'OpenRGB indisponível.');
  }
  disconnect() {
    this.#intent += 1;
    this.#fail(new Error('OpenRGB desconectado.'));
    this.#setStatus('disconnected', 'OpenRGB desconectado.');
  }
  #serialize(work) {
    const operation = this.#queue.then(work);
    this.#queue = operation.catch(() => {});
    return operation;
  }
  #send(id, device = 0, payload = Buffer.alloc(0)) {
    const socket = this.#socket;
    if (!socket || socket.destroyed) return Promise.reject(new Error('OpenRGB desconectado.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error('Tempo de envio ao OpenRGB esgotado.');
        this.#fail(error, socket); reject(error);
      }, this.#timeout);
      try {
        socket.write(encodePacket(id, device, payload), (error) => {
          clearTimeout(timer);
          if (error) { this.#fail(error, socket); reject(error); }
          else if (socket !== this.#socket) reject(new Error('A sessão OpenRGB mudou.'));
          else resolve();
        });
      } catch (error) { clearTimeout(timer); this.#fail(error, socket); reject(error); }
    });
  }
  #request(id, device = 0, payload = Buffer.alloc(0)) {
    if (this.#pending) return Promise.reject(new Error('Requisição SDK concorrente inválida.'));
    return new Promise((resolve, reject) => {
      const socket = this.#socket;
      const timer = setTimeout(() => this.#fail(new Error('Tempo de resposta do OpenRGB esgotado.'), socket), this.#timeout);
      this.#pending = { id, device, resolve, reject, timer };
      this.#send(id, device, payload).catch((error) => {
        if (this.#pending?.timer === timer) { clearTimeout(timer); this.#pending = null; reject(error); }
      });
    });
  }
  connect() {
    if (this.#ready) return Promise.resolve(this.status());
    if (this.#connecting) return this.#connecting;
    const connection = this.#open();
    this.#connecting = connection;
    connection.finally(() => { if (this.#connecting === connection) this.#connecting = null; }).catch(() => {});
    return connection;
  }
  async #open() {
    this.#setStatus('connecting', 'Conectando ao OpenRGB local...');
    const socket = net.createConnection({ host: '127.0.0.1', port: this.#port });
    this.#socket = socket;
    const decoder = new PacketDecoder();
    socket.on('data', (chunk) => {
      if (this.#socket !== socket) return;
      try {
        for (const packet of decoder.push(chunk)) {
          if (packet.id === 100) { this.#invalidate(); continue; }
          const pending = this.#pending;
          if (!pending || packet.id !== pending.id || packet.device !== pending.device) throw new Error('Resposta OpenRGB inesperada.');
          this.#pending = null; clearTimeout(pending.timer); pending.resolve(packet.payload);
        }
      } catch (error) { this.#fail(error, socket); }
    });
    socket.on('error', error => this.#fail(new Error(`OpenRGB indisponível: ${error.code || 'erro de conexão'}.`), socket));
    socket.on('close', () => this.#fail(new Error('OpenRGB desconectado.'), socket));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { const error = new Error('Tempo de conexão OpenRGB esgotado.'); this.#fail(error, socket); reject(error); }, this.#timeout);
        const cleanup = () => { clearTimeout(timer); socket.off('error', onError); socket.off('close', onClose); };
        const onError = (error) => { cleanup(); reject(error); };
        const onClose = () => { cleanup(); reject(new Error('OpenRGB desconectado.')); };
        socket.once('error', onError); socket.once('close', onClose);
        socket.once('connect', () => { cleanup(); resolve(); });
      });
      const response = await this.#request(40, 0, versionPayload());
      if (response.length !== 4 || response.readUInt32LE() < SDK_VERSION) throw new Error('Versão do OpenRGB incompatível: requer SDK 3 ou superior.');
      await this.#send(50, 0, Buffer.from('PrismHub\0'));
      if (this.#socket !== socket) throw new Error('A sessão OpenRGB mudou.');
      this.#ready = true;
      this.#setStatus('connected', 'OpenRGB conectado.');
      return this.status();
    } catch (error) { this.#fail(error, socket); throw error; }
  }
  refresh() {
    const intent = this.#intent;
    return this.#serialize(async () => {
      if (intent !== this.#intent) throw new Error('Consulta OpenRGB cancelada.');
      await this.connect();
      if (intent !== this.#intent) throw new Error('Consulta OpenRGB cancelada.');
      const socket = this.#socket;
      this.#generation += 1; this.#valid = false;
      const generation = this.#generation;
      try {
        const payload = await this.#request(0);
        if (payload.length !== 4 || payload.readUInt32LE() > 128) throw new Error('Quantidade de controladores SDK inválida.');
        const controllers = [];
        for (let index = 0; index < payload.readUInt32LE(); index += 1) {
          this.#assertGeneration(generation);
          controllers.push(parseController(await this.#request(1, index, versionPayload()), index));
        }
        this.#assertGeneration(generation);
        this.#controllers = controllers; this.#valid = true;
        this.emit('devices-updated', this.listControllers());
        return this.listControllers();
      } catch (error) {
        // A timeout, malformed descriptor or topology race must never leave stale writable indices.
        this.#fail(error, socket); throw error;
      }
    });
  }
  #assertGeneration(generation) {
    if (!this.#ready || this.#generation !== generation) throw new Error('A lista ou sessão OpenRGB mudou; consulte os dispositivos novamente.');
  }
  prepareLighting(request, { excludeTargets = [] } = {}) {
    const options = validateLightingRequest(request);
    if (!this.#valid) throw new Error('Lista OpenRGB inválida; consulte os dispositivos novamente.');
    const controllers = selectLightingControllers(this.#controllers, options.target, excludeTargets).filter(c => c.supportsStatic);
    if (controllers.length && options.effect !== 'estatico') throw new Error('Os componentes OpenRGB oferecem apenas RGB estático nesta integração.');
    const rgb = [1, 3, 5].map(offset => Math.round(Number.parseInt(options.color.slice(offset, offset + 2), 16) * options.brightness / 100));
    const plan = Object.freeze({ generation: this.#generation, controllers: Object.freeze(controllers.map(c => Object.freeze({ index: c.index, name: c.name }))) });
    const preparedControllers = structuredClone(controllers).map(controller => ({ ...controller, modePayload: prepareMode(controller) }));
    this.#plans.set(plan, { generation: this.#generation, controllers: preparedControllers, rgb });
    return plan;
  }
  applyPrepared(plan, { isCancelled = () => false } = {}) {
    return this.#serialize(async () => {
      const prepared = this.#plans.get(plan);
      if (!prepared) throw new Error('Plano OpenRGB inválido.');
      this.#plans.delete(plan);
      plan = prepared;
      this.#assertGeneration(plan.generation);
      if (!this.#valid) throw new Error('Lista OpenRGB inválida.');
      const completed = [];
      let active = null;
      const requireActive = () => { if (isCancelled()) throw new Error('Aplicação OpenRGB cancelada.'); };
      try {
        for (const controller of plan.controllers) {
          requireActive();
          this.#assertGeneration(plan.generation);
          active = { id: `openrgb:${controller.index}`, name: controller.name, stage: 'preparation-pending' };
          await this.#send(controller.modePayload ? 1101 : 1100, controller.index, controller.modePayload || Buffer.alloc(0));
          active.stage = 'mode-accepted';
          requireActive();
          this.#assertGeneration(plan.generation);
          const payload = encodeColorUpdate(controller.colorCount, plan.rgb);
          active.stage = 'color-pending';
          await this.#send(1050, controller.index, payload);
          completed.push({ id: `openrgb:${controller.index}`, name: controller.name, written: payload.length + 32 + (controller.modePayload?.length || 0), reports: 2, responses: 0, confirmation: 'transport-accepted' });
          active = null;
        }
        return completed;
      } catch (error) { error.completedDevices = completed; error.uncertainDevices = active ? [active] : []; throw error; }
    });
  }
}
