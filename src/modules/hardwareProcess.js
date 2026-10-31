import { EventEmitter } from 'node:events';
import { API_VERSION, normalizeDevice, validateLightingRequest, validateMouseRequest } from '../shared/contracts.js';

const unavailable = () => ({ apiVersion: API_VERSION, mouseControls: { dpi: false, pollingRate: false, onboardProfiles: false }, discovery: { state: 'unavailable', message: 'Consulte os dispositivos para iniciar o processo de hardware.' }, openrgb: { state: 'disconnected', message: 'OpenRGB desconectado.' } });

// Main owns this proxy, never a native HID handle. A timed-out write is never retried.
export class HardwareProcess extends EventEmitter {
  #spawn; #timeout; #child = null; #pending = new Map(); #sequence = 0;
  #devices = []; #status = unavailable(); #refreshing = null; #writing = false;
  #workerState = 'stopped'; #uncertain = false;
  #retiring = new Set(); #monitor = false;
  constructor({ spawnWorker, timeoutMs = 25000 }) {
    super();
    if (typeof spawnWorker !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 25 || timeoutMs > 60000) throw new TypeError('Processo de hardware inválido.');
    this.#spawn = spawnWorker; this.#timeout = timeoutMs;
  }
  list() { return structuredClone(this.#devices); }
  status() { return { ...structuredClone(this.#status), worker: { state: this.#workerState, writeUncertain: this.#uncertain } }; }
  #notify() { this.emit('devices-updated', this.list()); this.emit('status', this.status()); }
  #lose(child, message, exited = false) {
    if (child !== this.#child) return;
    this.#child = null; this.#workerState = 'unavailable';
    this.#devices = []; this.#status = unavailable();
    for (const { reject, timer, method } of this.#pending.values()) {
      clearTimeout(timer);
      const write = method === 'applyLighting';
      if (write) this.#uncertain = true;
      reject(new Error(write ? 'Comunicação de hardware interrompida; estado físico incerto. Confira os LEDs antes de tentar novamente.' : message));
    }
    this.#pending.clear();
    if (!exited) {
      this.#retiring.add(child);
      try { child.kill(); } catch { /* Remain blocked until the OS confirms exit. */ }
    }
    this.#notify();
    this.emit('hardware-error', { message });
  }
  #ensure() {
    if (this.#retiring.size) throw new Error('Aguarde a confirmação de encerramento do processo anterior.');
    if (this.#child) return this.#child;
    const child = this.#spawn();
    this.#child = child; this.#workerState = 'starting';
    child.on('message', message => {
      if (child !== this.#child || !message || typeof message !== 'object') return;
      if (message.event) {
        if (message.event === 'devices-updated' && Array.isArray(message.payload)) this.#devices = message.payload.map(normalizeDevice);
        else if (message.event === 'status') this.#status = message.payload;
        else if (message.event === 'foreground' && typeof message.payload === 'string' && (message.payload === '' || /^[a-z0-9 ._()-]{1,100}\.exe$/i.test(message.payload))) this.emit('foreground', message.payload.toLowerCase());
        else if (message.event === 'hardware-error') this.emit('hardware-error', { message: 'Falha ao consultar o processo de hardware.' });
        this.#notify();
        return;
      }
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.#pending.delete(message.id);
      if (message.error) {
        const error = new Error(String(message.error.message || 'Falha de hardware.').slice(0, 500));
        error.code = message.error.code;
        pending.reject(error);
      } else {
        if (message.result?.devices && ['start', 'refresh'].includes(pending.method)) {
          this.#devices = message.result.devices.map(normalizeDevice);
          this.#status = message.result.status; this.#workerState = 'ready'; this.#notify();
          if (this.#monitor) this.#request('monitorForeground', true).catch(() => {});
        }
        pending.resolve(message.result);
      }
    });
    child.once('exit', () => { this.#retiring.delete(child); this.#lose(child, 'O processo de hardware foi encerrado. Consulte os dispositivos novamente.', true); });
    child.once('error', () => this.#lose(child, 'Não foi possível iniciar o processo de hardware.'));
    return child;
  }
  #request(method, request) {
    let child;
    try { child = this.#ensure(); } catch { return Promise.reject(new Error('Não foi possível iniciar o processo de hardware.')); }
    return new Promise((resolve, reject) => {
      const id = ++this.#sequence;
      const timer = setTimeout(() => this.#lose(child, 'O processo de hardware excedeu o prazo e foi interrompido.'), this.#timeout);
      this.#pending.set(id, { resolve, reject, timer, method });
      try { child.postMessage({ id, method, request }); }
      catch { this.#lose(child, 'Falha de comunicação com o processo de hardware.'); }
    });
  }
  start() { return this.refresh(); }
  refresh() {
    if (this.#refreshing) return this.#refreshing;
    if (this.#writing) return Promise.resolve(this.list());
    const method = this.#child ? 'refresh' : 'start';
    const operation = this.#request(method).then(() => this.list());
    this.#refreshing = operation;
    operation.finally(() => { if (operation === this.#refreshing) this.#refreshing = null; }).catch(() => {});
    return operation;
  }
  async applyLighting(request) {
    const validated = validateLightingRequest(request);
    if (this.#writing || this.#refreshing) throw new Error('Aguarde a operação de hardware em andamento.');
    if (!this.#child || this.#workerState !== 'ready') throw new Error('Consulte os dispositivos antes de aplicar iluminação.');
    this.#writing = true;
    try { return await this.#request('applyLighting', validated); }
    finally { this.#writing = false; }
  }
  async applyMouseSettings(request) {
    validateMouseRequest(request);
    const error = new Error('DPI, polling rate e perfis no dispositivo aguardam protocolo e validação física confirmados.');
    error.code = 'ERR_UNSUPPORTED_CAPABILITY'; throw error;
  }
  setForegroundMonitoring(enabled) {
    if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('Preferência de monitoramento inválida.'));
    this.#monitor = enabled;
    if (!this.#child || this.#workerState !== 'ready') return Promise.resolve({ enabled: false });
    return this.#request('monitorForeground', enabled);
  }
  stop() {
    if (this.#child) this.#lose(this.#child, 'Operação de hardware cancelada.');
    this.#workerState = 'stopped';
  }
}
