import { validateLightingRequest } from './contracts.js';

export const mouseActions = Object.freeze(['Clique esquerdo', 'Clique direito', 'Clique do meio', 'Voltar', 'Avançar', 'Não atribuído']);
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !keys.includes(key))) throw new TypeError('Perfil inválido.');
}
export function validateMouseProfile(value) {
  record(value, ['stages', 'selected', 'buttons', 'pollingRate']);
  if (!Array.isArray(value.stages) || value.stages.length !== 5 || !value.stages.every(n => Number.isInteger(n) && n >= 100 && n <= 26000 && n % 100 === 0) ||
      !Number.isInteger(value.selected) || value.selected < 0 || value.selected > 4 ||
      !Array.isArray(value.buttons) || value.buttons.length !== 5 || !value.buttons.every(a => mouseActions.includes(a)) ||
      ![125, 250, 500, 1000, 2000, 4000, 8000].includes(value.pollingRate)) throw new TypeError('Preferências locais de mouse inválidas.');
  return { stages: [...value.stages], selected: value.selected, buttons: [...value.buttons], pollingRate: value.pollingRate };
}
export function validateProfile(value) {
  record(value, ['id', 'name', 'executable', 'autoApply', 'lighting', 'mouse', 'uiScale']);
  if (typeof value.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 60 || /[\u0000-\u001f\u007f]/.test(value.name) ||
      typeof value.executable !== 'string' || (value.executable !== '' && !/^[a-z0-9 ._()-]{1,100}\.exe$/i.test(value.executable)) || typeof value.autoApply !== 'boolean' ||
      (value.autoApply && !value.executable) || !['90', '100', '110'].includes(value.uiScale)) throw new TypeError('Nome, aplicativo ou preferências do perfil inválidos.');
  return { id: value.id, name: value.name.trim(), executable: value.executable.toLowerCase(), autoApply: value.autoApply, lighting: validateLightingRequest(value.lighting), mouse: validateMouseProfile(value.mouse), uiScale: value.uiScale };
}
export function validateProfileCollection(value) {
  record(value, ['version', 'items']);
  if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 12) throw new TypeError('Arquivo de perfis inválido (máximo: 12).');
  const items = value.items.map(validateProfile), ids = new Set(), apps = new Set();
  for (const item of items) {
    if (ids.has(item.id) || (item.executable && apps.has(item.executable))) throw new TypeError('Perfil ou aplicativo duplicado.');
    ids.add(item.id); if (item.executable) apps.add(item.executable);
  }
  return { version: 1, items };
}

export function normalizeLegacyMouseProfiles(value) {
  const items = [], ids = new Set();
  for (const candidate of (Array.isArray(value?.items) ? value.items.slice(0, 100) : [])) {
    try {
      if (!candidate || typeof candidate.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(candidate.id) || ids.has(candidate.id) ||
          typeof candidate.name !== 'string' || !candidate.name.trim() || candidate.name.length > 60 || /[\u0000-\u001f\u007f]/.test(candidate.name)) continue;
      const settings = validateMouseProfile({ stages: candidate.stages, selected: candidate.selected, buttons: candidate.buttons, pollingRate: candidate.pollingRate ?? 1000 });
      items.push({ id: candidate.id, name: candidate.name, ...settings }); ids.add(candidate.id);
      if (items.length === 12) break;
    } catch { /* A malformed local entry cannot prevent the desktop from opening. */ }
  }
  return items;
}
