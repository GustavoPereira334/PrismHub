export function initPreferences() {
  const tabs = [...document.querySelectorAll('[data-settings-tab]')];
  function select(tab) {
    tabs.forEach(item => { const active = item === tab; item.classList.toggle('active',active); item.setAttribute('aria-selected',String(active)); item.tabIndex = active ? 0 : -1; });
    document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== tab.dataset.settingsTab; });
  }
  tabs.forEach((tab,index) => {
    tab.addEventListener('click',() => select(tab));
    tab.addEventListener('keydown',event => {
      const offsets = {ArrowRight:1,ArrowLeft:-1,Home:-index,End:tabs.length-1-index};
      if (!(event.key in offsets)) return;
      event.preventDefault(); const next = tabs[(index+offsets[event.key]+tabs.length)%tabs.length]; select(next); next.focus();
    });
  });
  // These system features have no implementation in the current desktop API.
  document.querySelectorAll('[data-view="settings"] .toggle-switch').forEach(button => {
    button.disabled = true; button.classList.remove('active'); button.setAttribute('aria-checked','false'); button.title = 'Integração com o Windows ainda indisponível';
    const description = button.closest('.setting-row')?.querySelector('p');
    if (description) description.textContent = 'Disponível em uma próxima integração com o Windows.';
  });
  const selects = document.querySelectorAll('#settings-panel-windows select');
  const scale = selects[0];
  if (scale) {
    scale.setAttribute('aria-label','Escala da interface');
    const apply = value => { document.documentElement.style.zoom = value.startsWith('90') ? '.9' : value.startsWith('110') ? '1.1' : '1'; };
    try { const saved = localStorage.getItem('prismhub.ui-scale'); if ([...scale.options].some(o=>o.value === saved)) scale.value = saved; } catch {}
    apply(scale.value);
    scale.addEventListener('change',() => { apply(scale.value); try { localStorage.setItem('prismhub.ui-scale',scale.value); } catch {} });
  }
  if (selects[1]) { selects[1].disabled = true; selects[1].title = 'Português (Brasil) disponível nesta versão'; }
  document.querySelectorAll('#settings-panel-mouse select').forEach(select => { select.disabled = true; });
  return {
    getScale: () => scale?.value.startsWith('90') ? '90' : scale?.value.startsWith('110') ? '110' : '100',
    setScale: value => { if (scale) { scale.value = [...scale.options].find(option => option.value.startsWith(value))?.value || scale.options[0].value; scale.dispatchEvent(new Event('change')); } }
  };
}
