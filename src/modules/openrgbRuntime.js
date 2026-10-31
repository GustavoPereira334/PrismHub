import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

async function allocateLocalPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

// Process ownership stays in Main. No executable path or command arguments cross IPC.
export class BundledOpenRGB {
  #resources; #data; #allocate; #mkdir; #spawn; #child = null; #starting = null; #intent = 0;
  port = null;
  constructor({ resourcesPath, userDataPath, allocatePort = allocateLocalPort, prepareDirectory = directory => mkdir(directory, { recursive: true }), spawnProcess = spawn }) {
    this.#resources = resourcesPath; this.#data = userDataPath; this.#allocate = allocatePort; this.#mkdir = prepareDirectory; this.#spawn = spawnProcess;
  }
  start() {
    if (this.#starting) return this.#starting;
    if (this.#child) return Promise.resolve(this.port);
    const intent = this.#intent;
    const operation = (async () => {
      const config = path.join(this.#data, 'rgb-engine');
      await this.#mkdir(config);
      this.port = await this.#allocate();
      if (intent !== this.#intent) throw new Error('Inicialização RGB cancelada.');
      if (!Number.isInteger(this.port) || this.port < 1024 || this.port > 65535 || this.port === 6742) throw new Error('Porta privada RGB inválida.');
      const executable = path.join(this.#resources, 'openrgb', 'OpenRGB.exe');
      const child = this.#spawn(executable, ['--server', '--server-host', '127.0.0.1', '--server-port', String(this.port), '--noautoconnect', '--config', config], {
        cwd: path.dirname(executable), shell: false, windowsHide: true, stdio: 'ignore'
      });
      this.#child = child;
      const clear = () => { if (this.#child === child) this.#child = null; };
      child.once('exit', clear);
      await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', error => { clear(); reject(error); }); });
      if (intent !== this.#intent) { this.stop(); throw new Error('Inicialização RGB cancelada.'); }
      return this.port;
    })();
    this.#starting = operation;
    operation.finally(() => { if (this.#starting === operation) this.#starting = null; }).catch(() => {});
    return operation;
  }
  stop() {
    this.#intent += 1;
    const child = this.#child; this.#child = null;
    if (child && child.exitCode === null && !child.killed) child.kill();
  }
}
