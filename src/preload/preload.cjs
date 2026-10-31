const { contextBridge, ipcRenderer } = require('electron');

const deviceListeners = new Set();
const errorListeners = new Set();
const statusListeners = new Set();
const profileListeners = new Set();
ipcRenderer.on('profiles:automatic', (_event, result) => { profileListeners.forEach(listener => listener(result)); });

function subscribe(listeners, listener) {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
}

ipcRenderer.on('hardware:updated', (_event, status) => {
  statusListeners.forEach(listener => listener(status));
});

ipcRenderer.on('devices:updated', (_event, devices) => {
  deviceListeners.forEach((listener) => listener(devices));
});

ipcRenderer.on('devices:error', (_event, error) => {
  errorListeners.forEach((listener) => listener(error));
});

contextBridge.exposeInMainWorld('prismHub', Object.freeze({
  devices: Object.freeze({
    list: () => ipcRenderer.invoke('devices:list'),
    refresh: () => ipcRenderer.invoke('devices:refresh'),
    subscribe: (listener) => {
      return subscribe(deviceListeners, listener);
    },
    subscribeError: (listener) => {
      return subscribe(errorListeners, listener);
    }
  }),
  lighting: Object.freeze({
    apply: (request) => ipcRenderer.invoke('lighting:apply', request)
  }),
  mouse: Object.freeze({
    apply: request => ipcRenderer.invoke('mouse:apply', request)
  }),
  diagnostics: Object.freeze({ get: () => ipcRenderer.invoke('diagnostics:get'), export: () => ipcRenderer.invoke('diagnostics:export') }),
  profiles: Object.freeze({
    list: () => ipcRenderer.invoke('profiles:list'), save: profile => ipcRenderer.invoke('profiles:save', profile),
    remove: id => ipcRenderer.invoke('profiles:remove', id), apply: id => ipcRenderer.invoke('profiles:apply', id),
    export: () => ipcRenderer.invoke('profiles:export'), import: () => ipcRenderer.invoke('profiles:import'),
    subscribe: listener => subscribe(profileListeners, listener)
  }),
  updates: Object.freeze({
    status: () => ipcRenderer.invoke('updates:status'), check: () => ipcRenderer.invoke('updates:check'),
    stage: () => ipcRenderer.invoke('updates:stage'), install: () => ipcRenderer.invoke('updates:install')
  }),
  hardware: Object.freeze({
    status: () => ipcRenderer.invoke('hardware:status'),
    subscribe: listener => subscribe(statusListeners, listener)
  })
}));
