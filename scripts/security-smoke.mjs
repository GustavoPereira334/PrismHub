// Run with Electron, not Node. Uses only inert providers: never discovers or writes hardware.
import { app, BrowserWindow, ipcMain, session, utilityProcess } from 'electron';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { secureSession, secureWindow } from '../src/modules/electronSecurity.js';
import { registerHardwareIpc } from '../src/modules/ipcHandlers.js';
import { HardwareProcess } from '../src/modules/hardwareProcess.js';
import { ProfileStore } from '../src/modules/profileStore.js';
import { SignedUpdates } from '../src/modules/signedUpdates.js';
import { createDesktopServices } from '../src/modules/desktopServices.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = mkdtempSync(path.join(tmpdir(), 'prismhub-electron-'));
app.setPath('userData', directory);
app.on('window-all-closed', () => {});
async function run() {
let exitCode = 0;
let window;
const errors = [], violations = [];
const timer = setTimeout(() => { console.error('Electron smoke timed out'); app.exit(1); }, 20000);
try {
  await app.whenReady();
  const isolated = new HardwareProcess({ timeoutMs: 3000, spawnWorker: () => utilityProcess.fork(path.join(root, 'scripts/fixtures/stalled-worker.mjs'), [], { stdio: 'ignore' }) });
  await isolated.start();
  let responsive = false;
  setImmediate(() => { responsive = true; });
  await assert.rejects(isolated.applyLighting({ target: 'mouse', color: '#112233', brightness: 80, effect: 'estatico' }), /incerto/i);
  assert.equal(responsive, true);
  assert.equal(isolated.status().worker.state, 'unavailable');
  isolated.stop();
  secureSession(session.defaultSession);
  window = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: {
    preload: path.join(root, 'src/preload/preload.cjs'), contextIsolation: true,
    nodeIntegration: false, sandbox: true, webSecurity: true, webviewTag: false,
    allowRunningInsecureContent: false, navigateOnDragDrop: false
  } });
  secureWindow(window.webContents);
  window.webContents.on('console-message', event => {
    if ((event.level === 'error' || event.level === 3) && !event.message.includes('Content Security Policy') && !event.message.includes('Refused to connect')) errors.push(event.message);
  });
  window.webContents.on('preload-error', (_event, _path, error) => errors.push(error.message));
  const documentPath = path.join(root, 'src/renderer/index.html');
  const hardware = {
    list: () => [], refresh: () => [],
    status: () => ({ apiVersion: 1, discovery: { state: 'connected', message: 'Isolated test' }, openrgb: { state: 'disconnected' } }),
    applyLighting: () => assert.fail('Malformed request reached provider'),
    applyMouseSettings: () => { throw new Error('Protocolo não confirmado.'); }
  };
  const profiles = new ProfileStore({ directory });
  const updates = new SignedUpdates({ trust: { enabled: false }, version: '0.1.0', fetcher: () => assert.fail('Smoke must not fetch network') });
  const services = createDesktopServices({ hardware, profiles, updates, version: '0.1.0', dialog: {
    showSaveDialog: async () => ({ canceled: true }), showOpenDialog: async () => ({ canceled: true }), showMessageBox: async () => ({ response: 0 })
  }, getWindow: () => window });
  let ipcTime = 0;
  const unregister = registerHardwareIpc({ ipcMain, hardware, getWindow: () => window, documentUrl: pathToFileURL(documentPath).href, services, now: () => ipcTime += 1001 });
  await window.loadFile(documentPath);
  // The renderer itself lists devices on load; respect the production read cooldown.
  await new Promise(resolve => setTimeout(resolve, 60));
  const result = await window.webContents.executeJavaScript(`(async () => {
    const result = { nodeHidden: typeof require === 'undefined' && typeof process === 'undefined',
      bridge: typeof prismHub.devices.list === 'function' && typeof prismHub.mouse.apply === 'function' };
    result.devices = await prismHub.devices.list();
    try { await prismHub.lighting.apply({ target: 'mouse', color: '#fff', brightness: 80, effect: 'estatico' }); }
    catch { result.invalidRejected = true; }
    try { await prismHub.mouse.apply({ deviceId: 'hid:fixture', dpi: 800 }); }
    catch { result.mouseBlocked = true; }
    window.smokeViolations = [];
    document.addEventListener('securitypolicyviolation', e => window.smokeViolations.push(e.violatedDirective));
    try { await fetch('https://example.invalid/'); } catch { result.networkBlocked = true; }
    return result;
  })()`);
  assert.equal(result.nodeHidden, true);
  assert.equal(result.bridge, true);
  assert.deepEqual(result.devices, []);
  assert.equal(result.invalidRejected, true);
  assert.equal(result.mouseBlocked, true);
  assert.equal(result.networkBlocked, true);
  const desktop = await window.webContents.executeJavaScript(`(async () => {
    document.querySelector('[data-view-target="settings"]').click();
    document.getElementById('setup-profile-name').value = 'Smoke local';
    document.querySelector('[data-desktop-action="save-profile"]').click();
    await new Promise(resolve => setTimeout(resolve, 100));
    const stored = await prismHub.profiles.list();
    const saved = stored.items[0];
    document.getElementById('color-picker').value = '#aabbcc';
    document.getElementById('color-picker').dispatchEvent(new Event('input'));
    document.getElementById('setup-profile-select').value = saved.id;
    document.getElementById('setup-profile-select').dispatchEvent(new Event('change'));
    document.querySelector('[data-desktop-action="diagnostics"]').click();
    await new Promise(resolve => setTimeout(resolve, 50));
    const report = await prismHub.diagnostics.get();
    const exported = await prismHub.diagnostics.export();
    const update = await prismHub.updates.check();
    return { saved: stored.items.length === 1 && stored.items[0].autoApply === false,
      restored: document.getElementById('color-picker').value.toUpperCase() === saved.lighting.color,
      diagnostic: !!report.services && report.devices.length === 0,
      exportedCancelled: exported.cancelled, updatesBlocked: update.state === 'unconfigured',
      message: document.getElementById('setup-profile-status').textContent };
  })()`);
  assert.equal(desktop.saved, true, desktop.message);
  assert.equal(desktop.restored, true);
  assert.equal(desktop.diagnostic, true);
  assert.equal(desktop.exportedCancelled, true);
  assert.equal(desktop.updatesBlocked, true);
  for (const [width, height] of [[1440, 900], [1180, 760]]) {
    window.setContentSize(width, height);
    const settingsLayout = await window.webContents.executeJavaScript(`(() => { document.querySelector('[data-view-target="settings"]').click(); return document.documentElement.scrollWidth <= innerWidth; })()`);
    assert.equal(settingsLayout, true, 'Settings overflow at ' + width);
    const layout = await window.webContents.executeJavaScript(`(() => {
      document.querySelector('[data-view-target="mouse"]').click();
      const profile = document.querySelector('[data-action="apply-dpi"]');
      const mouseVisible = !document.querySelector('[data-view="mouse"]').hidden;
      const profileLocal = profile.textContent.includes('local');
      document.querySelector('[data-view-target="rgb"]').click();
      return { mouseVisible, profileLocal, rgbVisible: !document.querySelector('[data-view="rgb"]').hidden,
        overflow: document.documentElement.scrollWidth > innerWidth,
        applyDisabled: document.getElementById('apply-lighting').disabled };
    })()`);
    assert.equal(layout.mouseVisible, true);
    assert.equal(layout.rgbVisible, true);
    assert.equal(layout.profileLocal, true);
    assert.equal(layout.overflow, false, 'Horizontal overflow at ' + width);
    assert.equal(layout.applyDisabled, true);
    await window.webContents.executeJavaScript(`document.querySelector('[data-view-target="mouse"]').focus()`);
    // CDP input works in a hidden test window without stealing desktop focus.
    window.webContents.debugger.attach('1.3');
    await window.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', { enabled: true });
    await window.webContents.executeJavaScript(`document.querySelector('[data-view-target="mouse"]').focus()`);
    for (const type of ['keyDown', 'keyUp']) await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
      ...(type === 'keyDown' ? { text: '\r', unmodifiedText: '\r' } : {})
    });
    window.webContents.debugger.detach();
    assert.equal(await window.webContents.executeJavaScript(`!document.querySelector('[data-view="mouse"]').hidden`), true,
      JSON.stringify(await window.webContents.executeJavaScript(`({ focused: document.hasFocus(), active: document.activeElement.outerHTML.slice(0, 220) })`)));
  }
  violations.push(...await window.webContents.executeJavaScript('window.smokeViolations'));
  assert.ok(violations.includes('connect-src'));
  assert.deepEqual(errors, []);
  unregister();
  console.log('Electron smoke passed: real utility-process hang/termination, sandbox/preload, IPC, CSP, saved setup profiles, diagnostics, unconfigured updates, keyboard and layouts 1440x900 + 1180x760. No hardware providers used.');
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  clearTimeout(timer);
  window?.destroy();
  await session.defaultSession.closeAllConnections();
  await rm(directory, { recursive: true, force: true }).catch(() => {});
  app.exit(exitCode);
}
}
run().catch(error => { console.error(error); app.exit(1); });
