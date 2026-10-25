import { app, BrowserWindow, ipcMain, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HardwareService } from '../hardware/hardware-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hardware = new HardwareService();
let mainWindow;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1440,
		height: 900,
		minWidth: 900,
		minHeight: 620,
		backgroundColor: '#0a0d14',
		webPreferences: {
			preload: path.join(__dirname, '../preload/preload.cjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true
		}
	});
	mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
	mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
	mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(async () => {
	session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
	ipcMain.handle('devices:list', () => hardware.list());
	ipcMain.handle('devices:refresh', () => hardware.refresh());
	ipcMain.handle('lighting:apply', (_event, request) => hardware.applyLighting(request));
	hardware.on('devices-updated', (devices) => mainWindow?.webContents.send('devices:updated', devices));
	hardware.on('error', (error) => mainWindow?.webContents.send('devices:error', { message: 'Falha ao consultar dispositivos do Windows.' }));
	createWindow();
	await hardware.start();
	app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
	hardware.stop();
	if (process.platform !== 'darwin') app.quit();
});
