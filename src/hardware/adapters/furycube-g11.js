import HID from 'node-hid';

const REPORT_LENGTH = 134;
const REPORT_INTERVAL_MS = 500;

// Captured from FURYCUBE HUB on the user's G11 2.4G; see docs/hardware/furycube-g11.md.
// The USB release and exact configuration collection restrict writes to the observed revision.
export function findG11FeatureInterface(devices) {
  return devices.find((device) =>
    device.vendorId === 0x1d57 && device.productId === 0xfa60 &&
    device.product === 'G11 2.4G' && device.release === 0x1110 &&
    device.interface === 2 && device.usagePage === 0x0b && (device.usage ?? 0) === 0 &&
    /&MI_02&Col04#/i.test(device.path || '')
  ) ?? null;
}

export function buildG11StaticReports(options) {
  if (!options || options.effect !== 'estatico') throw new TypeError('O G11 oferece somente RGB estático neste adaptador.');
  if (typeof options.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(options.color)) throw new TypeError('Cor inválida. Use o formato #RRGGBB.');
  if (!Number.isInteger(options.brightness) || options.brightness < 0 || options.brightness > 100) throw new TypeError('Brilho inválido.');
  const prepare = Buffer.alloc(REPORT_LENGTH);
  prepare.set([0x0c, 0x0a, 0x01, 0xfe, 0x01, 0xfe]);
  const lighting = Buffer.alloc(REPORT_LENGTH);
  lighting.set([0x05, 0x0f, 0x01, 0x10, 0x03, 0x18]);
  for (let channel = 0; channel < 3; channel += 1) {
    const value = Number.parseInt(options.color.slice(1 + channel * 2, 3 + channel * 2), 16);
    lighting[6 + channel] = Math.round(value * options.brightness / 100);
  }
  lighting.set([0x01, 0x02], 9);
  const checksum = lighting.subarray(3, 11).reduce((sum, value) => sum + value, 0);
  lighting.writeUInt16BE(checksum, 11);
  return [prepare, lighting];
}

export class FuryCubeG11Adapter {
  #hid;
  #writeQueue = Promise.resolve();
  #lastWriteAt = -Infinity;

  constructor(hid = HID) { this.#hid = hid; }

  probe() {
    const feature = findG11FeatureInterface(this.#hid.devices());
    if (!feature) return null;
    let handle;
    try {
      handle = new this.#hid.HID(feature.path);
      return { adapterId: 'furycube-g11', name: 'FuryCube G11', vid: '1D57', pid: 'FA60', lightingEffects: ['estatico'] };
    } catch {
      return null;
    } finally { handle?.close(); }
  }

  async applyLighting(options, { isCancelled = () => false } = {}) {
    const reports = buildG11StaticReports(options);
    const now = Date.now();
    if (now - this.#lastWriteAt < 1000) throw new Error('Aguarde antes de enviar outra configuração ao G11.');
    this.#lastWriteAt = now;
    const operation = this.#writeQueue.then(async () => {
      const deadline = performance.now() + 3000;
      const requireActive = () => {
        if (isCancelled()) throw new Error('Aplicação RGB do G11 cancelada.');
        if (performance.now() > deadline) throw new Error('Tempo de aplicação RGB do G11 esgotado.');
      };
      requireActive();
      const feature = findG11FeatureInterface(this.#hid.devices());
      if (!feature) throw new Error('Nenhum G11 com revisão e interface compatível está conectado.');
      const handle = new this.#hid.HID(feature.path);
      try {
        let written = 0;
        for (let index = 0; index < reports.length; index += 1) {
          requireActive();
          const current = findG11FeatureInterface(this.#hid.devices());
          if (current?.path !== feature.path) throw new Error('O G11 foi desconectado ou a interface compatível mudou.');
          const count = handle.sendFeatureReport([...reports[index]]);
          if (count !== REPORT_LENGTH) throw new Error(`O Windows não aceitou os 134 bytes do relatório RGB do G11 (recebidos: ${count}).`);
          written += count;
          requireActive();
          if (index < reports.length - 1) await new Promise((resolve) => setTimeout(resolve, REPORT_INTERVAL_MS));
        }
        return { written, reports: reports.length };
      } finally { handle.close(); }
    });
    this.#writeQueue = operation.catch(() => {});
    return operation;
  }
}
