import { EventEmitter } from 'node:events';
import { discoverWindowsDevices } from './windows-discovery.js';
import { HidManager } from '../modules/hidManager.js';
import { OpenRGBClient } from '../modules/openrgbClient.js';
import { controllerTarget, selectLightingControllers } from '../modules/openrgbProtocol.js';
import { API_VERSION, normalizeDevice, validateLightingRequest, validateMouseRequest } from '../shared/contracts.js';

export class HardwareService extends EventEmitter {
  #devices = []; #timer = null; #refreshing = null; #busy = false; #running = false; #epoch = 0;
  #discover; #hid; #openrgb;
  #nativeTargets = [];
  #discoveryStatus = { state: 'idle', message: 'Aguardando consulta de hardware.' };

  constructor({ discover = discoverWindowsDevices, hidManager = new HidManager(), openrgb = new OpenRGBClient() } = {}) {
    super(); this.#discover = discover; this.#hid = hidManager; this.#openrgb = openrgb;
    openrgb.on('status', () => this.emit('status', this.status()));
    openrgb.on('devices-updated', controllers => this.#updateInternal(controllers));
  }

  status() { return { apiVersion: API_VERSION, mouseControls: { dpi: false, pollingRate: false, onboardProfiles: false }, discovery: { ...this.#discoveryStatus }, openrgb: this.#openrgb.status() }; }

  async applyMouseSettings(request) {
    validateMouseRequest(request);
    // No registered adapter has physically validated these write protocols.
    // Device IDs and claimed capabilities must never activate generic HID writes.
    const error = new Error('DPI, polling rate e perfis no dispositivo aguardam protocolo e validação física confirmados. Os perfis locais continuam disponíveis.');
    error.code = 'ERR_UNSUPPORTED_CAPABILITY';
    throw error;
  }
  list() { return structuredClone(this.#devices); }
  #replaceDevices(devices) {
    if (JSON.stringify(devices) !== JSON.stringify(this.#devices)) { this.#devices = devices; this.emit('devices-updated', this.list()); }
  }
  #updateInternal(controllers) {
    const internal = selectLightingControllers(controllers, 'all', this.#nativeTargets).map(controller => normalizeDevice({
      id: `openrgb:${controller.index}`, name: controller.name, manufacturer: controller.vendor,
      connection: 'openrgb', category: controllerTarget(controller) === 'internal' ? 'internal' : 'input', state: controller.supportsStatic ? 'controllable' : 'detected',
      lightingTarget: controllerTarget(controller),
      controllerId: 'openrgb', capabilities: { lighting: controller.supportsStatic === true },
      lightingEffects: controller.supportsStatic ? ['estatico'] : []
    }));
    this.#replaceDevices([...this.#devices.filter(d => d.connection !== 'openrgb'), ...internal]);
  }

  async start() {
    if (this.#running) return;
    this.#running = true;
    await this.refresh();
    if (!this.#running) return;
    this.#timer = setInterval(() => { this.refresh().catch(() => {}); }, 5000);
    this.#timer.unref?.();
  }
  stop() {
    this.#running = false; this.#epoch += 1;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    this.#openrgb.disconnect();
  }

  refresh() {
    if (this.#busy) return Promise.resolve(this.list());
    if (this.#refreshing) return this.#refreshing;
    const epoch = this.#epoch;
    const operation = (async () => {
      const results = await Promise.allSettled([
        (async () => {
          const devices = await this.#discover();
          const native = this.#hid.probe();
          this.#nativeTargets = [...new Set(native.map(device => device.target))];
          for (const probed of native) {
            const match = devices.find(d => d.vid === probed.vid && d.pid === probed.pid);
            const fields = { name: probed.name, state: 'experimental', controllerId: probed.adapterId, lightingEffects: probed.lightingEffects, lightingTarget: probed.target };
            if (match) { Object.assign(match, fields); match.capabilities = { ...match.capabilities, lighting: true }; }
            else devices.push(normalizeDevice({ ...fields, id: `hid:${probed.adapterId}:${probed.vid}:${probed.pid}`, vid: probed.vid, pid: probed.pid, connection: 'hid', category: 'input', capabilities: { lighting: true } }));
          }
          return devices;
        })(),
        this.#openrgb.refresh()
      ]);
      if (epoch !== this.#epoch) return this.list();
      const [windows, sdk] = results;
      this.#discoveryStatus = windows.status === 'fulfilled'
        ? { state: 'connected', message: 'Consulta de hardware concluída.' }
        : { state: 'unavailable', message: 'Não foi possível consultar os dispositivos do sistema.' };
      this.#replaceDevices([...(windows.status === 'fulfilled' ? windows.value : []), ...this.#devices.filter(d => d.connection === 'openrgb')]);
      if (sdk.status === 'fulfilled') this.#updateInternal(sdk.value);
      else this.#updateInternal([]);
      this.emit('status', this.status());
      if (windows.status === 'rejected') this.emit('hardware-error', { message: this.#discoveryStatus.message });
      return this.list();
    })();
    this.#refreshing = operation;
    operation.finally(() => { if (this.#refreshing === operation) this.#refreshing = null; }).catch(() => {});
    return operation;
  }

  async applyLighting(request) {
    const options = validateLightingRequest(request);
    const epoch = this.#epoch;
    const requireActive = () => { if (epoch !== this.#epoch) throw new Error('Aplicação de iluminação cancelada.'); };
    if (this.#busy) throw new Error('Aguarde a aplicação de iluminação em andamento.');
    this.#busy = true;
    try {
      // Preflight both providers before the first physical write.
      const hidPlan = this.#hid.prepareLighting(options);
      // Exclusive ownership by category avoids sending both HID and SDK commands to composite devices.
      const excludeTargets = [...new Set(hidPlan.targets.map(device => device.target).filter(Boolean))];
      let sdkPlan = null;
      const warnings = [];
      if (!excludeTargets.includes(options.target)) {
        try { await this.#openrgb.refresh(); }
        catch (error) {
          requireActive();
          if (options.target === 'internal' || !hidPlan.targets.length) throw new Error('Motor RGB indisponível. Reinicie o PrismHub e consulte os dispositivos novamente.', { cause: error });
          warnings.push('OpenRGB indisponível; somente os adaptadores nativos receberam a configuração.');
        }
        requireActive();
        if (!warnings.length) sdkPlan = this.#openrgb.prepareLighting(options, { excludeTargets });
      }
      if (!hidPlan.targets.length && !sdkPlan?.controllers.length) throw new Error('Nenhum dispositivo RGB compatível está disponível para este destino.');
      const devices = [], errors = [], uncertainDevices = [];
      for (const [provider, plan, manager, count] of [
        ['hid', hidPlan, this.#hid, hidPlan.targets.length],
        ['openrgb', sdkPlan, this.#openrgb, sdkPlan?.controllers.length ?? 0]
      ]) {
        if (!count) continue;
        try { requireActive(); devices.push(...await manager.applyPrepared(plan, { isCancelled: () => epoch !== this.#epoch })); }
        catch (error) {
          devices.push(...(error.completedDevices || []));
          uncertainDevices.push(...(error.uncertainDevices || []));
          errors.push({ provider, message: String(error.message || 'Falha de comunicação.').slice(0, 300) });
          if (epoch !== this.#epoch) {
            if (!devices.length && !uncertainDevices.length) throw error;
            break;
          }
        }
      }
      if (errors.length && !devices.length && !uncertainDevices.length) throw new Error(errors.map(error => error.message).join(' '));
      return { sent: devices.length, confirmation: devices.some(d => d.confirmation === 'transport-accepted') ? 'transport-accepted' : 'host-accepted', devices, uncertainDevices, warnings, errors, partial: errors.length > 0 };
    } finally { this.#busy = false; }
  }
}
