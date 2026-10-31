// No Electron import: these policies are exercised against event-capable test doubles.
export function secureWindow(contents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const event of ['will-navigate', 'will-frame-navigate', 'will-redirect', 'will-attach-webview']) {
    contents.on(event, e => e.preventDefault());
  }
}

export function secureSession(session) {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  session.setDevicePermissionHandler(() => false);
  session.on('will-download', event => event.preventDefault());
}
