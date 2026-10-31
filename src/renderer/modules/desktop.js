import { showToast } from './feedback.js';

export function initDesktop({ lighting, mouse, preferences }) {
  const api = window.prismHub;
  const select = document.getElementById('setup-profile-select');
  if (!api?.profiles || !select) return;
  const name = document.getElementById('setup-profile-name'), executable = document.getElementById('setup-profile-app');
  const automatic = document.getElementById('setup-profile-auto'), status = document.getElementById('setup-profile-status');
  const polling = document.getElementById('setup-profile-polling');
  let items = [], busy = false;
  const controls = [...document.querySelectorAll('[data-desktop-action]')];
  const selected = () => items.find(p => p.id === select.value);
  function render(collection, active = select.value) {
    items = collection.items;
    select.replaceChildren(new Option('Novo perfil', ''), ...items.map(p => new Option(p.name, p.id)));
    select.value = items.some(p => p.id === active) ? active : '';
    document.getElementById('setup-profile-count').textContent = String(items.length);
  }
  function load(profile) {
    name.value = profile?.name || '';
    executable.value = profile?.executable || '';
    automatic.checked = profile?.autoApply === true;
    if (profile) {
      lighting?.setState(profile.lighting); mouse?.setSettings(profile.mouse);
      preferences?.setScale(profile.uiScale); polling.value = String(profile.mouse.pollingRate);
    }
    status.textContent = profile ? 'Perfil carregado localmente. Nada foi enviado ao hardware.' : 'Configure iluminação e mouse; depois salve um novo perfil.';
  }
  select.addEventListener('change', () => load(selected()));
  const run = async action => {
    if (busy) return;
    busy = true; controls.forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (error) { showToast(error.message || 'Não foi possível concluir a operação.', 'error'); }
    finally { busy = false; controls.forEach(button => { button.disabled = false; }); }
  };
  for (const button of controls) button.addEventListener('click', () => run(async () => {
    const action = button.dataset.desktopAction;
    if (action === 'save-profile') {
      const id = select.value || crypto.randomUUID();
      const settings = mouse.getSettings(); settings.pollingRate = Number(polling.value);
      const collection = await api.profiles.save({ id, name: name.value.trim(), executable: executable.value.trim(), autoApply: automatic.checked,
        lighting: lighting.getState(), mouse: settings, uiScale: preferences.getScale() });
      render(collection, id); status.textContent = 'Perfil salvo neste computador. Nenhum comando de hardware foi enviado.';
    } else if (action === 'remove-profile') {
      if (!select.value) throw new Error('Selecione um perfil para excluir.');
      render(await api.profiles.remove(select.value), ''); load(null);
    } else if (action === 'apply-profile') {
      if (!select.value) throw new Error('Salve e selecione um perfil primeiro.');
      const result = await api.profiles.apply(select.value);
      status.textContent = result.lighting.partial ? 'Envio RGB parcial. Confira os LEDs e o diagnóstico.' : 'Relatórios RGB enviados. Confira os LEDs; DPI, polling e botões continuam locais.';
      showToast(status.textContent, result.lighting.partial ? 'error' : 'success');
    } else if (action === 'export-profiles') {
      if (!(await api.profiles.export()).cancelled) showToast('Perfis exportados. O arquivo inclui os aplicativos vinculados.');
    } else if (action === 'import-profiles') {
      const result = await api.profiles.import();
      if (!result.cancelled) { render(result.collection, ''); load(null); showToast('Perfis importados com aplicação automática desligada.'); }
    } else if (action === 'diagnostics') {
      const report = await api.diagnostics.get();
      const summary = document.getElementById('diagnostic-summary');
      const labels = { unavailable: 'indisponível', ready: 'pronto', idle: 'aguardando', stopped: 'parado', starting: 'iniciando', connected: 'conectado', connecting: 'conectando', disconnected: 'desconectado' };
      summary.textContent = `Hardware: ${labels[report.services.worker]}. Descoberta: ${labels[report.services.discovery]}. OpenRGB: ${labels[report.services.openrgb]}.${report.services.writeUncertain ? ' Um envio foi interrompido; confira o estado físico.' : ''}`;
      const list = document.getElementById('diagnostic-devices');
      list.replaceChildren(...report.devices.map(device => {
        const row = document.createElement('li');
        row.textContent = `${device.reference} · ${device.vid || '—'}:${device.pid || '—'} · ${device.adapter || 'sem adaptador confirmado'}. ${device.reasons.lighting} ${device.reasons.dpi} ${device.reasons.pollingRate}`;
        return row;
      }));
      if (!report.devices.length) summary.textContent += ' Nenhum dispositivo disponível na consulta atual.';
    } else if (action === 'export-diagnostics') {
      if (!(await api.diagnostics.export()).cancelled) showToast('Diagnóstico exportado sem nomes, caminhos e números de série.');
    } else if (action === 'stage-update' || action === 'install-update') {
      const result = action === 'stage-update' ? await api.updates.stage() : await api.updates.install();
      document.getElementById('update-status').textContent = result.message;
      document.querySelector('[data-desktop-action="install-update"]').hidden = result.state !== 'staged';
    }
  }));
  document.querySelector('[data-action="edit-profile"]')?.addEventListener('click', () => { document.getElementById('setup-profile-manager').scrollIntoView({ block: 'start' }); name.focus(); });
  document.querySelector('[data-action="check-update"]')?.addEventListener('click', () => run(async () => {
    const result = await api.updates.check();
    document.getElementById('update-status').textContent = result.message;
    document.querySelector('[data-desktop-action="stage-update"]').hidden = result.state !== 'available';
  }));
  api.profiles.subscribe(result => {
    status.textContent = result.state === 'sent' ? 'Perfil automático: relatórios RGB enviados. Confira os LEDs; preferências de mouse continuam locais.' : 'Perfil automático interrompido ou parcial. Confira os LEDs e o diagnóstico. Sem nova tentativa automática.';
  });
  api.profiles.list().then(collection => render(collection)).catch(error => { status.textContent = error.message; });
  api.updates.status().then(result => { document.getElementById('update-status').textContent = result.message; }).catch(() => {});
}
