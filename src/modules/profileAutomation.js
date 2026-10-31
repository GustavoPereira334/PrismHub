export class ProfileAutomation {
  #profiles; #apply; #notify; #last = null; #generation = 0; #queue = Promise.resolve(); #stopped = false;
  constructor({ profiles, apply, notify = () => {} }) { this.#profiles = profiles; this.#apply = apply; this.#notify = notify; }
  foreground(executable) {
    if (this.#stopped || executable === this.#last) return this.#queue;
    this.#last = executable;
    const generation = ++this.#generation;
    const operation = this.#queue.then(async () => {
      if (generation !== this.#generation || this.#stopped) return;
      const { items } = await this.#profiles.list();
      const profile = items.find(p => p.executable === executable && p.autoApply);
      if (!profile || generation !== this.#generation || this.#stopped) return;
      try {
        const result = await this.#apply(profile, { isCurrent: () => generation === this.#generation && !this.#stopped });
        this.#notify({ id: profile.id, state: result.lighting?.partial ? 'partial' : 'sent' });
      } catch { this.#notify({ id: profile.id, state: 'failed' }); }
    }).catch(() => this.#notify({ state: 'failed' }));
    this.#queue = operation;
    return operation;
  }
  stop() { this.#stopped = true; this.#generation++; }
}
