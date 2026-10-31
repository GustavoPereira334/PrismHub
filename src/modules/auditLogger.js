import { mkdir, stat, rename, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';

const channels = new Set(['devices:list', 'devices:refresh', 'hardware:status', 'lighting:apply', 'mouse:apply', 'profiles:list', 'profiles:save', 'profiles:remove', 'profiles:apply', 'profiles:export', 'profiles:import', 'diagnostics:get', 'diagnostics:export', 'updates:status', 'updates:check', 'updates:stage', 'updates:install']);
const events = new Set(['app.started', 'app.stopped', 'app.failed', 'engine.failed', 'hardware.failed', 'renderer.failed', 'profile.automatic', 'ipc.completed', 'ipc.failed', 'ipc.rejected']);

// Bounded, serialized, best-effort audit records. Never persist raw requests, errors,
// device IDs, serial numbers, native paths, colors, or renderer-supplied text.
export class AuditLogger {
  #directory; #maxBytes; #queue = Promise.resolve(); #pending = 0; #failures = 0; #dropped = 0;
  constructor({ directory, maxBytes = 512 * 1024 }) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || !Number.isInteger(maxBytes) || maxBytes < 512 || maxBytes > 10 * 1024 * 1024) throw new TypeError('Configuração de logs inválida.');
    this.#directory = directory; this.#maxBytes = maxBytes;
  }
  status() { return { failures: this.#failures, dropped: this.#dropped }; }
  record(event, metadata = {}) {
    if (!events.has(event) || this.#pending >= 128) { this.#dropped++; return false; }
    const record = { at: new Date().toISOString(), event };
    if (channels.has(metadata.channel)) record.channel = metadata.channel;
    if (typeof metadata.partial === 'boolean') record.partial = metadata.partial;
    if (Number.isInteger(metadata.sent) && metadata.sent >= 0 && metadata.sent <= 1024) record.sent = metadata.sent;
    const line = JSON.stringify(record) + '\n';
    this.#pending++;
    this.#queue = this.#queue.then(async () => {
      await mkdir(this.#directory, { recursive: true });
      const file = path.join(this.#directory, 'audit.jsonl');
      const size = await stat(file).then(s => s.size).catch(error => { if (error.code === 'ENOENT') return 0; throw error; });
      if (size + Buffer.byteLength(line) > this.#maxBytes) {
        await rm(file + '.1', { force: true });
        if (size > 0) await rename(file, file + '.1');
      }
      await appendFile(file, line, { encoding: 'utf8', mode: 0o600 });
    }).catch(() => { this.#failures++; }).finally(() => { this.#pending--; });
    return true;
  }
  flush() { return this.#queue; }
}
