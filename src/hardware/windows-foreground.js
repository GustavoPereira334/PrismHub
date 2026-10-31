import koffi from 'koffi';
import path from 'node:path';

let api;
// Read only. No process handles, paths or window titles leave the hardware process.
export function foregroundExecutable() {
  if (process.platform !== 'win32') return null;
  let handle;
  try {
    if (!api) {
      const user = koffi.load('user32.dll'), kernel = koffi.load('kernel32.dll');
      api = {
        foreground: user.func('intptr_t __stdcall GetForegroundWindow()'),
        processId: user.func('uint32 __stdcall GetWindowThreadProcessId(intptr_t, _Out_ uint32 *)'),
        open: kernel.func('intptr_t __stdcall OpenProcess(uint32, int32, uint32)'),
        image: kernel.func('int32 __stdcall QueryFullProcessImageNameW(intptr_t, uint32, _Out_ void *, _Inout_ uint32 *)'),
        close: kernel.func('int32 __stdcall CloseHandle(intptr_t)')
      };
    }
    const id = [0];
    api.processId(api.foreground(), id);
    if (!id[0]) return null;
    handle = api.open(0x1000, 0, id[0]);
    if (!handle || handle === 0n) return null;
    const size = [32768], buffer = Buffer.alloc(65536);
    if (!api.image(handle, 0, buffer, size)) return null;
    const name = path.win32.basename(buffer.subarray(0, size[0] * 2).toString('utf16le')).toLowerCase();
    return /^[a-z0-9 ._()-]{1,100}\.exe$/.test(name) ? name : null;
  } catch { return null; }
  finally { if (handle && handle !== 0n) api?.close(handle); }
}
