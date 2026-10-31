import { FuryCubeG11Adapter } from '../hardware/adapters/furycube-g11.js';
import { validateLightingRequest } from '../shared/contracts.js';

function defaultAdapters() {
  return [
    // Only this exact revision has a repository record of physical validation.
    // Keep X11 and SK80 protocol research outside the production write registry.
    { id: 'furycube-g11', target: 'mouse', adapter: new FuryCubeG11Adapter(), apply: (adapter, _device, options, guard) => adapter.applyLighting(options, guard) }
  ];
}

export class HidManager {
  #registry; #plans = new WeakMap();
  constructor(registry = defaultAdapters()) { this.#registry = registry; }

  probe() {
    const devices = [];
    for (const entry of this.#registry) {
      try {
        const device = entry.adapter.probe();
        if (device) devices.push({ adapterId: entry.id, name: device.name || 'Womier SK80', vid: device.vid, pid: device.pid, target: entry.target, lightingEffects: [...device.lightingEffects] });
      } catch { /* Windows discovery still shows detected-only devices if an adapter cannot probe. */ }
    }
    return devices;
  }

  prepareLighting(request) {
    const options = validateLightingRequest(request);
    const operations = [];
    for (const entry of this.#registry) {
      if (options.target !== 'all' && options.target !== entry.target) continue;
      const device = entry.adapter.probe();
      if (!device) continue;
      if (!device.lightingEffects.includes(options.effect)) throw new Error(`${entry.id} não oferece o efeito ${options.effect}. Nenhum dispositivo foi alterado.`);
      operations.push({ entry, device, options, id: entry.id, name: device.name || 'Womier SK80' });
    }
    const plan = Object.freeze({ targets: Object.freeze(operations.map(({ id, name, entry }) => Object.freeze({ id, name, target: entry.target }))) });
    this.#plans.set(plan, operations);
    return plan;
  }

  async applyPrepared(plan, { isCancelled = () => false } = {}) {
    const operations = this.#plans.get(plan);
    if (!operations) throw new Error('Plano HID inválido.');
    this.#plans.delete(plan);
    const completed = [], uncertain = [], failures = [];
    const withResults = (error) => {
      error.completedDevices = completed;
      error.uncertainDevices = uncertain;
      error.failures = failures;
      return error;
    };
    for (const { entry, device, options, id, name } of operations) {
      if (isCancelled()) throw withResults(new Error('Aplicação HID cancelada.'));
      try {
        const result = await entry.apply(entry.adapter, device, options, { isCancelled });
        completed.push({ id, name, written: result.written, reports: result.reports, responses: result.responses ?? 0 });
      } catch (error) {
        uncertain.push({ id, name, stage: 'write-pending' });
        failures.push({ id, name, message: String(error.message || 'Falha de comunicação HID.') });
      }
    }
    if (failures.length) throw withResults(new AggregateError(failures, failures.map(failure => `${failure.name}: ${failure.message}`).join(' ')));
    return completed;
  }
}
