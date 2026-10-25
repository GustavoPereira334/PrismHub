const { contextBridge, ipcRenderer } = require('electron');

const deviceListeners = new Set();
const errorListeners = new Set();

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
      if (typeof listener !== 'function') return () => {};
      deviceListeners.add(listener);
      return () => deviceListeners.delete(listener);
    },
    subscribeError: (listener) => {
      if (typeof listener !== 'function') return () => {};
      errorListeners.add(listener);
      return () => errorListeners.delete(listener);
    }
  }),
  lighting: Object.freeze({
    apply: (request) => ipcRenderer.invoke('lighting:apply', request)
  })
}));
