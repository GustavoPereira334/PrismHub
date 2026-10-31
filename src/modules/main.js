import { app, BrowserWindow, ipcMain, session, utilityProcess, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HardwareProcess } from './hardwareProcess.js';
import { registerHardwareIpc } from './ipcHandlers.js';
import { BundledOpenRGB } from './openrgbRuntime.js';
import { ProfileStore } from './profileStore.js';
import { ProfileAutomation } from './profileAutomation.js';
import { SignedUpdates, launchVerifiedInstaller } from './signedUpdates.js';
import { createDesktopServices } from './desktopServices.js';
import { readFile } from 'node:fs/promises';
import { secureSession, secureWindow } from './electronSecurity.js';
import { AuditLogger } from './auditLogger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const documentPath = path.join(__dirname, '../renderer/index.html');
let hardware;
let engine;
let mainWindow;
let logger;
let quitting = false;
let automation;

function send(channel, payload) {
  try {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed() &&
      mainWindow.webContents.mainFrame.url.split('#')[0] === pathToFileURL(documentPath).href) mainWindow.webContents.send(channel, payload);
  } catch { /* A renderer can disappear between the lifetime checks and delivery. */ }
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 620,
    backgroundColor: '#0a0d14',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      webviewTag: false, allowRunningInsecureContent: false, navigateOnDragDrop: false
    }
  });
  secureWindow(mainWindow.webContents);
  mainWindow.webContents.on('render-process-gone', () => logger?.record('renderer.failed'));
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(documentPath);
}

const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus(); } });

if (primaryInstance) app.whenReady().then(async () => {
  logger = new AuditLogger({ directory: path.join(app.getPath('userData'), 'logs') });
  logger.record('app.started');
  secureSession(session.defaultSession);
  let sdkPort = 6742;
  if (app.isPackaged && process.platform === 'win32') {
    engine = new BundledOpenRGB({ resourcesPath: process.resourcesPath, userDataPath: app.getPath('userData') });
    try { sdkPort = await engine.start(); } catch { sdkPort = 0; logger.record('engine.failed'); }
  }
  hardware = new HardwareProcess({ spawnWorker: () => utilityProcess.fork(path.join(__dirname, 'hardwareWorker.js'), [], {
    serviceName: 'PrismHub hardware', stdio: 'ignore', env: { ...process.env, PRISMHUB_SDK_PORT: String(sdkPort) }
  }) });
  const profiles = new ProfileStore({ directory: app.getPath('userData') });
  profiles.list().then(collection => hardware.setForegroundMonitoring(collection.items.some(profile => profile.autoApply))).catch(() => {});
  const trust = JSON.parse(await readFile(path.join(__dirname, '../config/update-trust.json'), 'utf8'));
  const updates = new SignedUpdates({ trust, version: app.getVersion(), directory: path.join(app.getPath('userData'), 'updates'),
    launch: async (file, metadata) => {
      await launchVerifiedInstaller(file, metadata);
      app.quit();
    }
  });
  const services = createDesktopServices({ hardware, profiles, updates, dialog, getWindow: () => mainWindow, version: app.getVersion(), logger });
  automation = new ProfileAutomation({ profiles, apply: (profile, guard) => services.profiles.applyAutomatic(profile.id, guard), notify: result => { logger.record('profile.automatic', { partial: result.state !== 'sent' }); send('profiles:automatic', result); } });
  hardware.on('foreground', executable => { automation.foreground(executable).catch(() => {}); });
  registerHardwareIpc({ ipcMain, hardware, getWindow: () => mainWindow, documentUrl: pathToFileURL(documentPath).href, logger, services });
  hardware.on('devices-updated', devices => send('devices:updated', devices));
  hardware.on('status', status => send('hardware:updated', status));
  hardware.on('hardware-error', error => { logger.record('hardware.failed'); send('devices:error', error); });
  createWindow();
  await hardware.start().catch(error => send('devices:error', { message: error.message }));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) { createWindow(); hardware.start().catch(error => send('devices:error', { message: error.message })); }
  });
}).catch(() => { logger?.record('app.failed'); app.quit(); });

app.on('before-quit', event => {
  automation?.stop();
  hardware?.stop(); engine?.stop();
  if (logger && !quitting) {
    event.preventDefault(); quitting = true;
    logger.record('app.stopped');
    // Best effort with bounded shutdown even on a stalled filesystem.
    Promise.race([logger.flush(), new Promise(resolve => setTimeout(resolve, 1500))]).finally(() => app.quit());
  }
});
app.on('window-all-closed', () => { hardware?.stop(); engine?.stop(); if (process.platform !== 'darwin') app.quit(); });
