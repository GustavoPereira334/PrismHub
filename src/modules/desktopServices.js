import { readFile, writeFile, stat } from 'node:fs/promises';
import { buildDiagnostics } from './diagnostics.js';

function profileId(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(id)) throw new TypeError('Perfil inválido.');
  return id;
}
export function createDesktopServices({ hardware, profiles, updates, dialog, getWindow, version, logger }) {
  async function saveJson(defaultPath, value) {
    const selected = await dialog.showSaveDialog(getWindow(), { defaultPath, filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (selected.canceled || !selected.filePath) return { cancelled: true };
    try { await writeFile(selected.filePath, JSON.stringify(value, null, 2), { encoding: 'utf8', mode: 0o600 }); }
    catch { throw new Error('Não foi possível salvar o arquivo selecionado.'); }
    return { cancelled: false };
  }
  const diagnostics = () => buildDiagnostics({ version, devices: hardware.list(), status: hardware.status(), logs: logger?.status() });
  const monitoring = collection => {
    hardware.setForegroundMonitoring?.(collection.items.some(profile => profile.autoApply)).catch(() => {});
    return collection;
  };
  const apply = async (id, automatic = false, isCurrent = () => true) => {
    const profile = (await profiles.list()).items.find(p => p.id === profileId(id));
    if (!profile) throw new Error('Perfil não encontrado.');
    if (automatic && (!profile.autoApply || !isCurrent())) throw new Error('Aplicação automática cancelada ou não autorizada.');
    const lighting = await hardware.applyLighting(profile.lighting);
    return { lighting, skipped: ['dpi', 'pollingRate', 'buttons', 'onboardProfiles'] };
  };
  return {
    diagnostics: { get: diagnostics, export: () => saveJson('PrismHub-diagnostico.json', diagnostics()) },
    profiles: {
      list: () => profiles.list(), save: async value => monitoring(await profiles.save(value)), remove: async id => monitoring(await profiles.remove(profileId(id))), apply: id => apply(id),
      applyAutomatic: (id, { isCurrent }) => apply(id, true, isCurrent),
      export: async () => saveJson('PrismHub-perfis.json', await profiles.list()),
      import: async () => {
        const selected = await dialog.showOpenDialog(getWindow(), { properties: ['openFile'], filters: [{ name: 'Perfis JSON', extensions: ['json'] }] });
        if (selected.canceled || selected.filePaths.length !== 1) return { cancelled: true };
        let parsed;
        try {
          if ((await stat(selected.filePaths[0])).size > 128 * 1024) throw new Error();
          const bytes = await readFile(selected.filePaths[0]);
          if (bytes.length > 128 * 1024) throw new Error();
          parsed = JSON.parse(bytes);
        } catch { throw new Error('Não foi possível ler o arquivo de perfis selecionado.'); }
        const confirmation = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['Cancelar', 'Substituir perfis locais'], defaultId: 0, cancelId: 0, message: 'Substituir todos os perfis locais pelo arquivo escolhido?', detail: 'Exporte seus perfis atuais antes de substituir. Perfis importados terão aplicação automática desligada.' });
        if (confirmation.response !== 1) return { cancelled: true };
        // Importing a file never authorizes automatic physical writes.
        const collection = await profiles.replace({ ...parsed, items: parsed?.items?.map(p => ({ ...p, autoApply: false })) });
        return { cancelled: false, collection: monitoring(collection) };
      }
    },
    updates: {
      status: () => updates.status(), check: () => updates.check(), stage: () => updates.stage(),
      install: async () => {
        const confirmation = await dialog.showMessageBox(getWindow(), { type: 'question', buttons: ['Cancelar', 'Instalar e fechar o PrismHub'], defaultId: 0, cancelId: 0, message: 'Instalar a atualização verificada?', detail: 'O aplicativo será fechado e o instalador poderá solicitar permissão do Windows.' });
        if (confirmation.response !== 1) return { state: 'cancelled', message: 'Instalação cancelada.' };
        return updates.install();
      }
    }
  };
}
