import koffi from 'koffi';

const GENERIC_READ = 0x80000000;
const GENERIC_WRITE = 0x40000000;
const FILE_SHARE_READ = 0x00000001;
const FILE_SHARE_WRITE = 0x00000002;
const OPEN_EXISTING = 3;
const FILE_FLAG_OVERLAPPED = 0x40000000;
const ERROR_IO_PENDING = 997;
const IOCTL_HID_GET_FEATURE = 0x000b0192;
const INVALID_HANDLE_VALUE = -1n;
const OVERLAPPED_SIZE = 32;

let api;

function getApi() {
  if (process.platform !== 'win32') throw new Error('O controle experimental do SK80 requer Windows.');
  if (api) return api;

  const kernel32 = koffi.load('kernel32.dll');
  const hid = koffi.load('hid.dll');
  api = {
    createFile: kernel32.func('__stdcall', 'CreateFileW', 'intptr_t', [
      'str16', 'uint32', 'uint32', 'void *', 'uint32', 'uint32', 'void *'
    ]),
    closeHandle: kernel32.func('__stdcall', 'CloseHandle', 'int32', ['intptr_t']),
    getLastError: kernel32.func('__stdcall', 'GetLastError', 'uint32', []),
    getOverlappedResult: kernel32.func('__stdcall', 'GetOverlappedResult', 'int32', [
      'intptr_t', 'void *', '_Out_ uint32 *', 'int32'
    ]),
    hidSetFeature: hid.func('__stdcall', 'HidD_SetFeature', 'uint8', ['intptr_t', 'void *', 'uint32']),
    deviceIoControl: kernel32.func(
      'int32 __stdcall DeviceIoControl(intptr_t hDevice, uint32 dwIoControlCode, void *lpInBuffer, uint32 nInBufferSize, void *lpOutBuffer, uint32 nOutBufferSize, _Out_ uint32 *lpBytesReturned, void *lpOverlapped)'
    )
  };
  return api;
}

export class WindowsHidFeatureTransport {
  #api;
  #handle;

  constructor(path) {
    this.#api = getApi();
    this.#handle = this.#api.createFile(
      path,
      GENERIC_READ | GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE,
      null,
      OPEN_EXISTING,
      FILE_FLAG_OVERLAPPED,
      null
    );
    if (this.#handle === INVALID_HANDLE_VALUE) {
      const errorCode = this.#api.getLastError();
      this.#handle = null;
      throw new Error(`O Windows não abriu a interface HID do SK80 (erro ${errorCode}).`);
    }
  }

  sendFeatureReport(report) {
    if (this.#handle === null) throw new Error('A interface HID do SK80 está fechada.');
    const buffer = Buffer.from(report);
    const accepted = this.#api.hidSetFeature(this.#handle, buffer, buffer.length);
    if (!accepted) {
      const errorCode = this.#api.getLastError();
      throw new Error(`HidD_SetFeature recusou o relatório do SK80 (erro ${errorCode}).`);
    }
    return buffer.length;
  }

  getFeatureReport() {
    if (this.#handle === null) throw new Error('A interface HID do SK80 está fechada.');
    const input = Buffer.alloc(65);
    const output = Buffer.alloc(65);
    const overlapped = Buffer.alloc(OVERLAPPED_SIZE);
    const bytesReturned = [0];
    let accepted = this.#api.deviceIoControl(
      this.#handle,
      IOCTL_HID_GET_FEATURE,
      input,
      input.length,
      output,
      output.length,
      bytesReturned,
      overlapped
    );
    let errorCode = accepted ? 0 : this.#api.getLastError();
    if (!accepted && errorCode === ERROR_IO_PENDING) {
      accepted = this.#api.getOverlappedResult(this.#handle, overlapped, bytesReturned, 1);
      errorCode = accepted ? 0 : this.#api.getLastError();
    }
    if (!accepted) {
      throw new Error(`DeviceIoControl (IOCTL_HID_GET_FEATURE) falhou no SK80 (erro ${errorCode}).`);
    }
    return { bytesReturned: bytesReturned[0] };
  }

  close() {
    if (this.#handle === null) return;
    this.#api.closeHandle(this.#handle);
    this.#handle = null;
  }
}
