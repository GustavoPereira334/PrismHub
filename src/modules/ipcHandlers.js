import { validateLightingRequest, validateMouseRequest } from '../shared/contracts.js';

export function registerHardwareIpc({ ipcMain, hardware, getWindow, documentUrl, logger, services, now = () => performance.now() }) {
  const lastCall = new Map();
  const inFlight = new Set();
  const cooldown = { 'devices:list': 50, 'hardware:status': 50, 'devices:refresh': 1000, 'lighting:apply': 1000, 'mouse:apply': 1000 };
  const audit = (event, data) => { try { logger?.record(event, data); } catch { /* Logging must not change hardware outcomes. */ } };
  function requireTrustedSender(event) {
    const window = getWindow();
    let trusted = false;
    try {
      const frame = event.senderFrame;
      trusted = !!window && !window.isDestroyed() && !window.webContents.isDestroyed() &&
        event.sender === window.webContents && frame === window.webContents.mainFrame &&
        typeof frame?.url === 'string' && frame.url.split('#')[0] === documentUrl;
    } catch { trusted = false; }
    if (!trusted) throw new Error('A origem desta solicitação não é permitida.');
  }
  const handlers = {
    'devices:list': () => hardware.list(),
    'devices:refresh': () => hardware.refresh(),
    'hardware:status': () => hardware.status(),
    'lighting:apply': request => hardware.applyLighting(validateLightingRequest(request)),
    'mouse:apply': request => hardware.applyMouseSettings(validateMouseRequest(request)),
    ...(services ? {
      'diagnostics:get': () => services.diagnostics.get(),
      'diagnostics:export': () => services.diagnostics.export(),
      'profiles:list': () => services.profiles.list(),
      'profiles:save': value => services.profiles.save(value),
      'profiles:remove': id => services.profiles.remove(id),
      'profiles:apply': id => services.profiles.apply(id),
      'profiles:export': () => services.profiles.export(),
      'profiles:import': () => services.profiles.import(),
      'updates:status': () => services.updates.status(),
      'updates:check': () => services.updates.check(),
      'updates:stage': () => services.updates.stage(),
      'updates:install': () => services.updates.install()
    } : {})
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      try {
        requireTrustedSender(event);
        const writable = ['lighting:apply', 'mouse:apply', 'profiles:save', 'profiles:remove', 'profiles:apply'].includes(channel);
        if (args.length !== (writable ? 1 : 0)) throw new TypeError('Quantidade de argumentos IPC inválida.');
        const time = now();
        if (inFlight.has(channel) || time - (lastCall.get(channel) ?? -Infinity) < (cooldown[channel] ?? 500)) throw new Error('Aguarde antes de solicitar esta operação novamente.');
        lastCall.set(channel, time);
        // Validate before invoking a provider; exceptions retain existing IPC rejection behavior.
        const result = handler(args[0]);
        inFlight.add(channel);
        return Promise.resolve(result).then(value => {
          audit('ipc.completed', { channel, partial: value?.partial === true, sent: value?.sent });
          return value;
        }, error => {
          audit('ipc.failed', { channel });
          throw error;
        }).finally(() => inFlight.delete(channel));
      } catch (error) { audit('ipc.rejected', { channel }); throw error; }
    });
  }
  return () => { for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel); };
}
