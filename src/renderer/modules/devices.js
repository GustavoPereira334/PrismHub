import { showToast } from './feedback.js';

const stateLabels = {
  detected: 'Detectado - controles ainda não disponíveis',
  'partially-supported': 'Suporte parcial',
  controllable: 'Controlável',
  certified: 'Certificado',
  experimental: 'Suporte experimental',
  unsupported: 'Detectado, mas ainda não controlável',
  disconnected: 'O dispositivo foi desconectado.',
  error: 'Erro de comunicação com o dispositivo'
};

const categoryLabels = { audio: 'Áudio', input: 'Entrada', usb: 'USB', other: 'Outro' };

function text(value, fallback = 'Informação indisponível') {
  return value || fallback;
}

function makeMetric(label, value) {
  const wrapper = document.createElement('span');
  const title = document.createElement('small');
  title.textContent = label;
  const content = document.createElement('strong');
  content.textContent = text(value);
  wrapper.append(title, content);
  return wrapper;
}

function makeDeviceCard(device) {
  const card = document.createElement('article');
  card.className = 'full-device-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Abrir detalhes de ${device.name}`);
  card.dataset.deviceId = device.id;
  card.dataset.category = device.category;
  card.dataset.name = `${device.name} ${device.manufacturer || ''}`.toLocaleLowerCase('pt-BR');

  const visual = document.createElement('div');
  visual.className = `device-visual ${device.category}`;
  visual.textContent = device.category === 'audio' ? '♫' : device.category === 'input' ? '⌁' : '◈';
  const header = document.createElement('div');
  header.className = 'device-card-head';
  const info = document.createElement('div');
  const status = document.createElement('span');
  status.className = 'online-label';
  status.textContent = stateLabels[device.state] || 'Estado indisponível';
  const name = document.createElement('h2');
  name.textContent = device.name;
  const description = document.createElement('p');
  description.textContent = `${categoryLabels[device.category] || 'Dispositivo'} - ${text(device.connection)}`;
  info.append(status, name, description);
  header.append(info);
  card.append(visual, header);

  const metrics = document.createElement('div');
  metrics.className = 'device-metrics';
  metrics.append(makeMetric('FABRICANTE', device.manufacturer), makeMetric('VID', device.vid), makeMetric('PID', device.pid));
  card.append(metrics);
  return card;
}

function openDeviceDialog(device) {
  const dialog = document.getElementById('device-dialog');
  if (!dialog) return;
  const state = document.getElementById('dialog-device-state');
  const capability = document.getElementById('dialog-device-capability');
  const description = document.getElementById('dialog-device-description');
  const name = document.getElementById('dialog-device-name');
  name.textContent = device.name;
  description.textContent = `${categoryLabels[device.category] || 'Dispositivo'} conectado por ${text(device.connection)}.`;
  state.textContent = stateLabels[device.state] || 'Estado indisponível';
  const candidate = device.adapterCandidates?.[0];
  capability.textContent = device.capabilities.lighting
    ? 'Iluminação confirmada'
    : candidate
      ? `Possível ${candidate.label} - identificação ainda não confirmada`
      : 'Controles não confirmados';
  if (typeof dialog.showModal === 'function') dialog.showModal();
}

function makeCompactDevice(device) {
  const item = document.createElement('article');
  const icon = document.createElement('span');
  icon.className = 'compact-icon';
  icon.textContent = device.category === 'audio' ? '♫' : '◈';
  const content = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = device.name;
  const status = document.createElement('small');
  status.textContent = stateLabels[device.state] || 'Estado indisponível';
  content.append(name, status);
  item.append(icon, content);
  return item;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

export function initDevices() {
  const search = document.getElementById('device-search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const grid = document.getElementById('full-device-grid');
  const empty = document.getElementById('device-empty');
  const overviewList = document.getElementById('overview-device-list');
  const rgbList = document.getElementById('rgb-device-list');
  let devices = [];
  let filter = 'all';

  const render = () => {
    const query = search?.value.trim().toLocaleLowerCase('pt-BR') ?? '';
    const visible = devices.filter((device) => (filter === 'all' || device.category === filter) && `${device.name} ${device.manufacturer || ''}`.toLocaleLowerCase('pt-BR').includes(query));
    grid.replaceChildren(...visible.map(makeDeviceCard));
    if (empty) empty.hidden = visible.length > 0;
    if (overviewList) overviewList.replaceChildren(...devices.slice(0, 4).map(makeCompactDevice));
    if (overviewList && devices.length === 0) {
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = 'Nenhum dispositivo compatível encontrado.';
      overviewList.append(message);
    }
    const lighting = devices.filter((device) => device.capabilities.lighting === true);
    document.dispatchEvent(new CustomEvent('prismhub:devices-updated', { detail: { devices, lightingCount: lighting.length } }));
    if (rgbList) {
      rgbList.replaceChildren();
      const message = document.createElement('p');
      message.className = 'empty-state';
      message.textContent = lighting.length ? `${lighting.length} dispositivo(s) com iluminação confirmada.` : 'Dispositivo detectado, mas ainda não controlável.';
      rgbList.append(message);
    }
    setText('rgb-device-total', `${lighting.length} ${lighting.length === 1 ? 'controlável' : 'controláveis'}`);
    setText('nav-device-count', String(devices.length));
    setText('connected-count', devices.length ? `${devices.length} dispositivo(s) detectado(s)` : 'Nenhum dispositivo compatível encontrado');
    setText('overview-device-count', String(devices.length));
    setText('overview-controllable-count', String(devices.filter((device) => device.state === 'controllable' || device.state === 'certified').length));
    setText('overview-lighting-count', String(lighting.length));
    setText('overview-device-state', devices.length ? 'Informações recebidas do Windows' : 'Nenhum dispositivo compatível');
    setText('overview-system-state', devices.length ? 'Detectado' : 'Vazio');
    setText('overview-title', devices.length ? 'Dispositivos encontrados' : 'Nenhum dispositivo compatível encontrado');
    setText('overview-subtitle', devices.length ? 'Controles aparecem somente quando um adaptador confirma a capacidade.' : 'O PrismHub continuará monitorando conexões do Windows.');
    setText('service-status', devices.length ? 'Serviço de hardware ativo' : 'Nenhum dispositivo compatível');
    setText('header-status', devices.length ? `${devices.length} dispositivo(s) detectado(s)` : 'Aguardando dispositivos');
    setText('settings-device-count', String(devices.length));
  };

  filters.forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.filter;
    filters.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    render();
  }));
  search?.addEventListener('input', render);
  grid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-device-id]');
    const device = devices.find((item) => item.id === card?.dataset.deviceId);
    if (device) openDeviceDialog(device);
  });
  grid?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('[data-device-id]');
    const device = devices.find((item) => item.id === card?.dataset.deviceId);
    if (!device) return;
    event.preventDefault();
    openDeviceDialog(device);
  });
  document.querySelector('[data-action="discover"]')?.addEventListener('click', async () => {
    try {
      await window.prismHub?.devices.refresh();
      showToast('Consulta de dispositivos solicitada.');
    } catch {
      showToast('Não foi possível consultar os dispositivos.', 'error');
    }
  });
  window.prismHub?.devices.subscribe((nextDevices) => { devices = Array.isArray(nextDevices) ? nextDevices : []; render(); });
  window.prismHub?.devices.subscribeError(() => showToast('Erro de comunicação com o dispositivo.', 'error'));
  window.prismHub?.devices.list().then((nextDevices) => { devices = Array.isArray(nextDevices) ? nextDevices : []; render(); }).catch(() => showToast('Permissão necessária para consultar dispositivos.', 'error'));
  render();
}
