import HID from 'node-hid';

const VENDOR_ID = 0x1d57;
const PRODUCT_IDS = new Set([0xfa55, 0xfa60, 0xfa61]);
const LIGHT_MODES = Object.freeze({ estatico: 0x10, pulso: 0x20, espectro: 0x30 });

export function findX11FeatureInterface(devices) {
  const matches = devices.filter((device) =>
    device.vendorId === VENDOR_ID &&
    PRODUCT_IDS.has(device.productId) &&
    device.interface === 2
  );
  return matches.find((device) => /col04/i.test(device.path || '')) ?? null;
}

export function parseHexColor(value) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError('Cor inválida. Use o formato #RRGGBB.');
  }
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

export function buildX11LightingReport({ color, effect, speed }) {
  const mode = LIGHT_MODES[effect];
  if (mode === undefined) throw new TypeError(`Efeito não suportado pelo Attack Shark X11: ${effect}.`);
  const rgb = parseHexColor(color);
  if (!Number.isFinite(speed) || speed < 0 || speed > 100) throw new TypeError('Velocidade inválida.');

  const userSpeed = Math.max(1, Math.min(5, Math.round(1 + (speed / 100) * 4)));
  const encodedSpeed = 6 - userSpeed;
  const report = Buffer.alloc(15);
  report.set([0x05, 0x0f, 0x01, mode, encodedSpeed, 0xa8, rgb.r, rgb.g, rgb.b, 0x14, 0x04]);
  report[11] = [rgb.r, rgb.g, rgb.b].filter((component) => component >= 100).length;
  report[12] = report.subarray(3, 11).reduce((sum, byte) => (sum + byte) & 0xff, 0);
  return report;
}

export class AttackSharkX11Adapter {
  #hid;
  #writeQueue = Promise.resolve();

  constructor(hid = HID) {
    this.#hid = hid;
  }

  probe() {
    const feature = findX11FeatureInterface(this.#hid.devices());
    if (!feature) return null;
    let handle;
    try {
      handle = new this.#hid.HID(feature.path);
      return {
        adapterId: 'attack-shark-x11',
        name: 'Attack Shark X11',
        vid: '1D57',
        pid: feature.productId.toString(16).padStart(4, '0').toUpperCase(),
        featurePath: feature.path,
        lightingEffects: Object.keys(LIGHT_MODES),
      };
    } catch {
      return null;
    } finally {
      handle?.close();
    }
  }

  applyLighting(featurePath, options) {
    const report = buildX11LightingReport(options);
    const operation = this.#writeQueue.then(() => {
      const handle = new this.#hid.HID(featurePath);
      try {
        const written = handle.sendFeatureReport([...report]);
        if (!Number.isInteger(written) || written <= 0) throw new Error('O dispositivo não confirmou a gravação HID.');
        return { written };
      } finally {
        handle.close();
      }
    });
    this.#writeQueue = operation.catch(() => {});
    return operation;
  }
}
