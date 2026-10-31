import { HardwareService } from '../hardware/hardware-service.js';
import { OpenRGBClient } from './openrgbClient.js';
import { foregroundExecutable } from '../hardware/windows-foreground.js';
import { EventEmitter } from 'node:events';

// Only the parent-owned utility process loads native hardware modules.
const port = Number(process.env.PRISMHUB_SDK_PORT || 6742);
const disabledSdk = Object.assign(new EventEmitter(), {
  status: () => ({ state: 'unavailable', message: 'Motor RGB próprio indisponível.' }),
  refresh: async () => { throw new Error('Motor RGB indisponível.'); }, disconnect: () => {}
});
const hardware = new HardwareService({ openrgb: port === 0 ? disabledSdk : new OpenRGBClient({ port, timeoutMs: 3000 }) });
const parent = process.parentPort;
if (!parent) throw new Error('Este módulo exige um processo auxiliar Electron.');
const send = message => parent.postMessage(message);
for (const event of ['devices-updated', 'status', 'hardware-error']) hardware.on(event, payload => send({ event, payload }));
let lastForeground = null;
let monitorForeground = false;
const timer = setInterval(() => {
  if (!monitorForeground) return;
  const name = foregroundExecutable();
  if (name !== lastForeground) { lastForeground = name; send({ event: 'foreground', payload: name || '' }); }
}, 2000);
timer.unref();
const commands = {
  start: async () => { await hardware.start(); return { devices: hardware.list(), status: hardware.status() }; },
  refresh: async () => { await hardware.refresh(); return { devices: hardware.list(), status: hardware.status() }; },
  applyLighting: request => hardware.applyLighting(request),
  monitorForeground: enabled => {
    if (typeof enabled !== 'boolean') throw new TypeError('Preferência de monitoramento inválida.');
    monitorForeground = enabled; lastForeground = null;
    return { enabled };
  }
};
parent.on('message', async ({ data }) => {
  if (!data || !Number.isSafeInteger(data.id) || !Object.hasOwn(commands, data.method)) return;
  try { send({ id: data.id, result: await commands[data.method](data.request) }); }
  catch (error) { send({ id: data.id, error: { message: error.message, code: error.code } }); }
});
