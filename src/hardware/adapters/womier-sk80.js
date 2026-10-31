import HID from 'node-hid';
import { WindowsHidFeatureTransport } from '../windows-hid-feature.js';

const VENDOR_ID = 0x05ac;
const PRODUCT_ID = 0x024f;
const INTERFACE_NUMBER = 3;
const USAGE_PAGE = 0xff13;
const USAGE = 0x01;
const REPORT_LENGTH = 65;
const REPORT_INTERVAL_MS = 1;

// Key IDs and report framing follow the MIT-licensed SK80 protocol research:
// https://github.com/TheNotary/keyboard_driver_sk80
const KEY_IDS = [
  ...range(0x01, 0x0d), ...range(0x13, 0x1f), ...range(0x25, 0x31),
  ...range(0x37, 0x43), ...range(0x49, 0x55), ...range(0x5b, 0x67),
  0x74, 0x76, 0x77, 0x79
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function commandReport(command, parameter = 0) {
  const report = Buffer.alloc(REPORT_LENGTH);
  report[1] = 0x04;
  report[2] = command;
  if (parameter) report[9] = parameter;
  return report;
}

function buildColorPages({ r, g, b }) {
  const pages = Array.from({ length: 8 }, () => Buffer.alloc(REPORT_LENGTH));
  for (const keyId of KEY_IDS) {
    const page = pages[keyId >> 4];
    const offset = 1 + (keyId & 0x0f) * 4;
    page[offset] = keyId;
    page[offset + 1] = r;
    page[offset + 2] = g;
    page[offset + 3] = b;
  }
  const terminator = Buffer.alloc(REPORT_LENGTH);
  terminator[REPORT_LENGTH - 2] = 0xaa;
  terminator[REPORT_LENGTH - 1] = 0x55;
  return [...pages, terminator];
}

export function parseSK80Color(value, brightness = 100) {
  if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
    throw new TypeError('Cor inválida. Use o formato #RRGGBB.');
  }
  if (!Number.isInteger(brightness) || brightness < 0 || brightness > 100) {
    throw new TypeError('Brilho inválido. Use um valor inteiro entre 0 e 100.');
  }
  const factor = brightness / 100;
  return {
    r: Math.round(Number.parseInt(value.slice(1, 3), 16) * factor),
    g: Math.round(Number.parseInt(value.slice(3, 5), 16) * factor),
    b: Math.round(Number.parseInt(value.slice(5, 7), 16) * factor)
  };
}

export function buildSK80StaticReports({ color, brightness }) {
  const rgb = parseSK80Color(color, brightness);
  const start = [commandReport(0x18), commandReport(0x23, 0x09)];
  const values = buildColorPages(rgb);
  const finish = [commandReport(0x02), commandReport(0xf0)];
  const customMode = [
    commandReport(0x18),
    commandReport(0x13, 0x01),
    (() => {
      const report = Buffer.alloc(REPORT_LENGTH);
      report.set([0x80, 0xff], 1);
      report.set([0x01, 0x05, 0x05], 9);
      report.set([0xaa, 0x55], 14);
      return report;
    })(),
    ...finish
  ];
  return [
    ...start.map((report) => ({ report, expectResponse: true })),
    ...values.map((report) => ({ report, expectResponse: false })),
    ...finish.map((report) => ({ report, expectResponse: true })),
    ...customMode.slice(0, 2).map((report) => ({ report, expectResponse: true })),
    { report: customMode[2], expectResponse: false },
    ...customMode.slice(3).map((report) => ({ report, expectResponse: true }))
  ];
}

export function findSK80FeatureInterface(devices) {
  return devices.find((device) =>
    device.vendorId === VENDOR_ID &&
    device.productId === PRODUCT_ID &&
    device.interface === INTERFACE_NUMBER &&
    device.usagePage === USAGE_PAGE &&
    device.usage === USAGE &&
    /&MI_03(?:&|#)/i.test(device.path || '')
  ) ?? null;
}

export class WomierSK80Adapter {
  #hid;
  #transportFactory;
  #writeQueue = Promise.resolve();
  #lastWriteAt = 0;

  constructor(hid = HID, transportFactory = WindowsHidFeatureTransport) {
    this.#hid = hid;
    this.#transportFactory = transportFactory;
  }

  probe() {
    const feature = findSK80FeatureInterface(this.#hid.devices());
    if (!feature) return null;
    let handle;
    try {
      handle = new this.#transportFactory(feature.path);
      return {
        adapterId: 'womier-sk80',
        vid: '05AC',
        pid: '024F',
        featurePath: feature.path,
        lightingEffects: ['estatico']
      };
    } catch {
      return null;
    } finally {
      handle?.close();
    }
  }

  async applyLighting(options) {
    if (!options || options.effect !== 'estatico') {
      throw new TypeError('O SK80 aceita somente iluminação estática neste adaptador experimental.');
    }
    const reports = buildSK80StaticReports(options);
    const now = Date.now();
    if (now - this.#lastWriteAt < 1000) throw new Error('Aguarde antes de enviar outra configuração ao SK80.');
    this.#lastWriteAt = now;
    const operation = this.#writeQueue.then(async () => {
      const feature = findSK80FeatureInterface(this.#hid.devices());
      if (!feature) throw new Error('A interface RGB experimental do SK80 não está disponível.');
      const handle = new this.#transportFactory(feature.path);
      try {
        let written = 0;
        let responses = 0;
        for (let index = 0; index < reports.length; index += 1) {
          const { report, expectResponse } = reports[index];
          let count;
          try {
            count = handle.sendFeatureReport(report);
          } catch (cause) {
            throw new Error(`O Windows recusou o relatório HID ${index + 1}/${reports.length} do SK80.`, { cause });
          }
          if (!Number.isInteger(count) || count < REPORT_LENGTH) {
            throw new Error(`O Windows aceitou apenas ${count} bytes do relatório HID ${index + 1}/${reports.length} do SK80.`);
          }
          written += count;
          if (expectResponse) {
            try {
              handle.getFeatureReport();
            } catch (cause) {
              throw new Error(`O SK80 não respondeu à etapa ${index + 1}/${reports.length} do protocolo.`, { cause });
            }
            responses += 1;
          }
          if (index < reports.length - 1) await wait(REPORT_INTERVAL_MS);
        }
        return { written, reports: reports.length, responses };
      } finally {
        handle.close();
      }
    });
    this.#writeQueue = operation.catch(() => {});
    return operation;
  }
}
