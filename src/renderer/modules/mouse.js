import { showToast } from './feedback.js';
import { validateMouseProfile, normalizeLegacyMouseProfiles } from '../../shared/profiles.js';
const KEY = 'prismhub.mouse-profiles.v1';
const actions = ['Clique esquerdo', 'Clique direito', 'Clique do meio', 'Voltar', 'Avançar', 'Não atribuído'];
const fresh = name => ({ id: crypto.randomUUID(), name, stages: [400,800,1600,3200,6400], selected: 1, buttons: actions.slice(0,5) });
export function initMouse() {
  const list = document.getElementById('dpi-stages'), profiles = document.getElementById('mouse-profile-list'), buttons = document.getElementById('mouse-button-list');
  if (!list || !profiles || !buttons) return;
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch {}
  let items = normalizeLegacyMouseProfiles(data);
  if (!items.length) items = [fresh('Padrão')];
  let active = items.some(p => p.id === data?.active) ? data.active : items[0].id;
  const current = () => items.find(p => p.id === active);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({items,active})); return true; } catch { showToast('Não foi possível salvar neste computador.', 'error'); return false; } };
  function render() {
    const profile = current();
    document.querySelector('.dpi-eyebrow').textContent = `PERFIL LOCAL · ${profile.name}`;
    list.replaceChildren(...profile.stages.map((dpi,index) => {
      const row = document.createElement('div'); row.className = `dpi-stage${profile.selected === index ? ' selected' : ''}`;
      const choose = document.createElement('button'); choose.type = 'button'; choose.className = 'dpi-stage-label'; choose.textContent = String(index+1).padStart(2,'0');
      choose.setAttribute('aria-label', `Selecionar estágio ${index+1}`); choose.setAttribute('aria-pressed', String(profile.selected === index));
      choose.onclick = () => { profile.selected = index; save(); render(); };
      const range = document.createElement('input'); range.type = 'range'; range.min = 100; range.max = 26000; range.step = 100; range.value = dpi; range.setAttribute('aria-label', `Sensibilidade do estágio ${index+1}`);
      const number = document.createElement('input'); number.type = 'number'; number.min = 100; number.max = 26000; number.step = 100; number.value = dpi; number.setAttribute('aria-label', `DPI do estágio ${index+1}`);
      const sync = value => { const n = Number(value); if (!value || !Number.isFinite(n) || n < 100 || n > 26000) { number.setAttribute('aria-invalid','true'); return; } number.removeAttribute('aria-invalid'); profile.stages[index] = Math.round(n/100)*100; range.value = number.value = profile.stages[index]; };
      range.oninput = () => sync(range.value); number.oninput = () => sync(number.value);
      const unit = document.createElement('span'); unit.className = 'dpi-unit'; unit.textContent = 'DPI'; row.append(choose,range,number,unit); return row;
    }));
    buttons.replaceChildren(...profile.buttons.map((action,index) => {
      const row = document.createElement('li'), label = document.createElement('label'), select = document.createElement('select');
      label.textContent = `${index+1}. ${['Principal','Secundário','Rolagem','Lateral traseiro','Lateral dianteiro'][index]}`; label.htmlFor = select.id = `mouse-action-${index}`;
      actions.forEach(name => { const option = new Option(name,name); option.selected = action === name; select.add(option); }); select.onchange = () => { profile.buttons[index] = select.value; };
      row.append(label,select); return row;
    }));
    profiles.replaceChildren(...items.map(item => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `profile-item${item.id === active ? ' active' : ''}`; button.setAttribute('aria-pressed',String(item.id === active));
      const name = document.createElement('strong'), state = document.createElement('small'); name.textContent = item.name; state.textContent = item.id === active ? 'Ativo' : 'Local'; button.append(name,state);
      button.onclick = () => { active = item.id; save(); render(); }; return button;
    }));
    const add = document.createElement('button'); add.type = 'button'; add.className = 'profile-add'; add.textContent = '＋ Criar perfil'; add.disabled = items.length >= 12;
    add.onclick = () => { const p = fresh(`Perfil ${items.length+1}`); items.push(p); active = p.id; save(); render(); }; profiles.append(add);
  }
  const apply = document.querySelector('[data-action="apply-dpi"]'); apply.disabled = false; apply.textContent = 'Salvar perfil local';
  apply.onclick = () => { if (list.querySelector('[aria-invalid=true]')) return showToast('Informe DPI entre 100 e 26.000.', 'error'); if (save()) showToast('Perfil salvo neste computador. Aplicação ao mouse aguarda suporte de hardware.'); };
  document.addEventListener('prismhub:devices-updated', ({detail}) => {
    const mouse = detail.devices.find(d => d.controllerId === 'attack-shark-x11' || d.category === 'mouse');
    document.querySelector('.mouse-toolbar .settings-state').textContent = mouse?.name || 'PERFIL LOCAL';
    document.querySelector('.mouse-device-state p').textContent = mouse ? `${mouse.name} detectado. DPI e botões aguardam suporte confirmado.` : 'Prepare seus perfis enquanto nenhum mouse compatível está conectado.';
    document.querySelector('.mouse-device-state .capability-badge').textContent = mouse ? 'Detectado' : 'Sem mouse confirmado';
  });
  render();
  return {
    getSettings: () => {
      if (list.querySelector('[aria-invalid=true]')) throw new Error('Corrija os valores de DPI antes de salvar o perfil.');
      const p = current();
      return validateMouseProfile({ stages: p.stages, selected: p.selected, buttons: p.buttons, pollingRate: p.pollingRate || 1000 });
    },
    setSettings: settings => { Object.assign(current(), validateMouseProfile(settings)); save(); render(); }
  };
}
