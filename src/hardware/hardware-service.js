import { EventEmitter } from 'node:events';
import { discoverWindowsDevices } from './windows-discovery.js';
import { AttackSharkX11Adapter } from './adapters/attack-shark-x11.js';

export class HardwareService extends EventEmitter {
  #devices = [];
  #timer = null;
  #refreshing = false;
  #x11 = new AttackSharkX11Adapter();
  #x11Device = null;

  async start() {
    await this.refresh();
    this.#timer = setInterval(() => this.refresh(), 5000);
    this.#timer.unref?.();
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  async refresh() {
    if (this.#refreshing) return this.#devices;
    this.#refreshing = true;
    try {
      const next = await discoverWindowsDevices();
      this.#x11Device = this.#x11.probe();
      if (this.#x11Device) {
        const match = next.find((device) => device.vid === this.#x11Device.vid && device.pid === this.#x11Device.pid);
        if (match) {
          match.name = this.#x11Device.name;
          match.state = 'experimental';
          match.capabilities.lighting = true;
          match.lightingEffects = [...this.#x11Device.lightingEffects];
          match.controllerId = this.#x11Device.adapterId;
        }
      }
      const changed = JSON.stringify(next) !== JSON.stringify(this.#devices);
      this.#devices = next;
      if (changed) this.emit('devices-updated', this.#devices);
      return this.#devices;
    } catch (error) {
      this.emit('error', error);
      return this.#devices;
    } finally {
      this.#refreshing = false;
    }
  }

  list() { return structuredClone(this.#devices); }

  async applyLighting(request) {
    if (!this.#x11Device) throw new Error('Nenhum Attack Shark X11 controlável está conectado.');
    if (!request || typeof request !== 'object') throw new TypeError('Configuração de iluminação inválida.');
    if (!['all', 'mouse'].includes(request.target)) throw new Error('O destino selecionado não contém um mouse compatível.');
    const result = await this.#x11.applyLighting(this.#x11Device.featurePath, request);
    return { applied: 1, devices: [{ id: 'attack-shark-x11', name: this.#x11Device.name, written: result.written }] };
  }
}
