import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateProfile, validateProfileCollection } from '../shared/profiles.js';

export class ProfileStore {
  #directory; #data = null; #queue = Promise.resolve();
  constructor({ directory }) { this.#directory = directory; }
  async #load() {
    if (this.#data) return this.#data;
    try {
      const content = await readFile(path.join(this.#directory, 'setup-profiles.json'));
      if (content.length > 128 * 1024) throw new Error();
      this.#data = validateProfileCollection(JSON.parse(content));
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Não foi possível ler os perfis. Preserve o arquivo existente para recuperação.');
      this.#data = { version: 1, items: [] };
    }
    return this.#data;
  }
  async list() { await this.#queue; return structuredClone(await this.#load()); }
  #mutate(change) {
    const operation = this.#queue.then(async () => {
      const next = validateProfileCollection(change(structuredClone(await this.#load())));
      await mkdir(this.#directory, { recursive: true });
      const target = path.join(this.#directory, 'setup-profiles.json'), temporary = target + '.' + randomUUID() + '.tmp';
      try {
        const file = await open(temporary, 'wx', 0o600);
        try { await file.writeFile(JSON.stringify(next, null, 2)); await file.sync(); } finally { await file.close(); }
        await rename(temporary, target);
        this.#data = next;
      } finally { await rm(temporary, { force: true }).catch(() => {}); }
      return structuredClone(next);
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }
  save(value) {
    let profile;
    try { profile = validateProfile(value); } catch (error) { return Promise.reject(error); }
    return this.#mutate(data => { data.items = [...data.items.filter(p => p.id !== profile.id), profile]; return data; });
  }
  remove(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(id)) return Promise.reject(new TypeError('Perfil inválido.'));
    return this.#mutate(data => { data.items = data.items.filter(p => p.id !== id); return data; });
  }
  replace(value) {
    let collection;
    try { collection = validateProfileCollection(value); } catch (error) { return Promise.reject(error); }
    return this.#mutate(() => collection);
  }
}
