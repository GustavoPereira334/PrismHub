// Inert Electron utility-process fixture. Never imports discovery, HID or OpenRGB.
const parent = process.parentPort;
parent.on('message', ({ data }) => {
  if (['start', 'refresh'].includes(data.method)) parent.postMessage({ id: data.id, result: { devices: [], status: { apiVersion: 1, discovery: { state: 'connected' }, openrgb: { state: 'disconnected' } } } });
  if (data.method === 'applyLighting') { while (true) { /* Simulate blocked synchronous native I/O in this child only. */ } }
});
