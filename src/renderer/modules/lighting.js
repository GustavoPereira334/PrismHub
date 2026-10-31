import { showToast } from './feedback.js';
import { validateLightingRequest } from '../../shared/contracts.js';

const defaults = { color: '#7C5CFF', effect: 'estatico', brightness: 80, speed: 55, target: 'all' };
const targetControllers = {
  keyboard: new Set(['womier-sk80']),
  mouse: new Set(['attack-shark-x11', 'furycube-g11']),
  internal: new Set(['openrgb'])
};

export function initLighting() {
  const preview = document.getElementById('lighting-preview');
  const picker = document.getElementById('color-picker');
  const hex = document.getElementById('hex-color');
  const error = document.getElementById('color-error');
  const brightness = document.getElementById('brightness');
  const speed = document.getElementById('speed');
  const target = document.getElementById('apply-target');
  const restore = document.getElementById('restore-profile');
  const apply = document.getElementById('apply-lighting');
  const status = document.getElementById('profile-status');
  const realtime = document.getElementById('realtime-sync');
  if (!preview || !picker || !hex) return;

  let devices = [];
  let busy = false;
  let statusMessage = null;

  const getState = () => ({
    color: picker.value.toUpperCase(),
    effect: document.querySelector('input[name="effect"]:checked')?.value ?? defaults.effect,
    brightness: Number(brightness.value),
    speed: Number(speed.value),
    target: target.value,
  });

  const targetDevices = (selectedTarget = target.value) => devices.filter((device) => {
    if (device.capabilities?.lighting !== true || !device.controllerId) return false;
    return selectedTarget === 'all' || (device.lightingTarget ? device.lightingTarget === selectedTarget : targetControllers[selectedTarget]?.has(device.controllerId) === true);
  });

  const dispatch = () => {
    statusMessage = null;
    const state = getState();
    document.dispatchEvent(new CustomEvent('prismhub:lighting-change', { detail: state }));
    return state;
  };

  const updateAvailability = () => {
    const selectedDevices = targetDevices();
    const hasDevice = selectedDevices.length > 0;
    const isExperimental = selectedDevices.some((device) => device.controllerId === 'womier-sk80');
    const selectedEffect = getState().effect;
    const effectSupported = !hasDevice || selectedDevices.every((device) => (device.lightingEffects || []).includes(selectedEffect));

    if (apply) apply.disabled = busy || !hasDevice || !effectSupported;

    if (!status || busy) return;
    if (statusMessage) { status.lastChild.textContent = ` ${statusMessage}`; return; }
    if (!hasDevice) status.lastChild.textContent = ' Nenhum adaptador RGB compatível disponível para este destino';
    else if (!effectSupported) status.lastChild.textContent = ' O efeito selecionado não é suportado por todos os destinos escolhidos';
    else if (isExperimental) status.lastChild.textContent = ' SK80 experimental pronto — o PrismHub informará quando o Windows aceitar os relatórios';
    else status.lastChild.textContent = ` ${selectedDevices.map((device) => device.name).join(', ')} pronto(s) para envio`;
  };

  const updateEffects = () => {
    const selectedDevices = targetDevices();
    const effectSets = selectedDevices.map((device) => new Set(device.lightingEffects || []));
    const supported = effectSets.length
      ? [...effectSets[0]].filter((effect) => effectSets.every((set) => set.has(effect)))
      : null;
    document.querySelectorAll('input[name="effect"]').forEach((input) => {
      input.disabled = supported !== null && !supported.includes(input.value);
      input.closest('.effect-card')?.classList.toggle('disabled', input.disabled);
    });
    const selected = document.querySelector('input[name="effect"]:checked');
    if (selected?.disabled) {
      const fallback = document.querySelector('input[name="effect"]:not(:disabled)');
      if (fallback) {
        fallback.checked = true;
        fallback.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    updateAvailability();
  };

  const setColor = (value) => {
    const normalized = value.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(normalized)) {
      hex.classList.add('invalid');
      hex.setAttribute('aria-invalid', 'true');
      error.textContent = 'Use o formato #RRGGBB.';
      return false;
    }
    picker.value = normalized;
    hex.value = normalized;
    hex.classList.remove('invalid');
    hex.removeAttribute('aria-invalid');
    error.textContent = '';
    document.documentElement.style.setProperty('--rgb-color', normalized);
    document.querySelectorAll('.swatch').forEach((item) => item.classList.toggle('selected', item.dataset.color === normalized));
    dispatch();
    return true;
  };

  picker.addEventListener('input', () => setColor(picker.value));
  hex.addEventListener('change', () => setColor(hex.value.trim()));
  hex.addEventListener('input', () => { if (hex.value.length === 7) setColor(hex.value.trim()); });
  document.querySelectorAll('.swatch').forEach((swatch) => swatch.addEventListener('click', () => setColor(swatch.dataset.color)));
  document.addEventListener('prismhub:lighting-change', (event) => {
    if (realtime.getAttribute('aria-checked') !== 'true') return;
    preview.dataset.effect = event.detail.effect;
    preview.style.setProperty('--preview-brightness', String(event.detail.brightness / 100));
    const duration = Math.max(0.7, 4.6 - (event.detail.speed * 0.039));
    preview.style.setProperty('--effect-duration', `${duration.toFixed(2)}s`);
  });
  document.querySelector('.effects-grid')?.addEventListener('change', () => { dispatch(); updateAvailability(); });
  brightness.addEventListener('input', dispatch);
  speed.addEventListener('input', dispatch);
  target.addEventListener('change', () => { dispatch(); updateEffects(); });
  realtime.addEventListener('click', () => requestAnimationFrame(dispatch));
  document.addEventListener('prismhub:devices-updated', (event) => {
    devices = Array.isArray(event.detail?.devices) ? event.detail.devices : [];
    updateEffects();
  });

  restore.addEventListener('click', () => {
    setColor(defaults.color);
    brightness.value = String(defaults.brightness);
    speed.value = String(defaults.speed);
    target.value = defaults.target;
    realtime.setAttribute('aria-checked', 'true');
    realtime.classList.add('active');
    const radio = document.querySelector(`input[name="effect"][value="${defaults.effect}"]`);
    if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    brightness.dispatchEvent(new Event('input', { bubbles: true }));
    speed.dispatchEvent(new Event('input', { bubbles: true }));
    updateEffects();
    showToast('Configuração local restaurada.');
  });

  apply.addEventListener('click', async () => {
    if (apply.disabled || busy) return;
    const state = dispatch();
    busy = true;
    apply.setAttribute('aria-busy', 'true');
    updateAvailability();
    status.lastChild.textContent = ' enviando relatórios de iluminação...';
    try {
      const result = await window.prismHub?.lighting.apply(state);
      if (result?.partial) {
        const completed = result.devices.map(device => device.name).join(', ');
        const uncertain = (result.uncertainDevices || []).map(device => device.name).join(', ');
        throw new Error(`Envio incompleto.${completed ? ` Envio concluído para ${completed}.` : ''}${uncertain ? ` Confira o estado de ${uncertain}.` : ''} ${(result.errors || []).map(item => item.message).join(' ')}`);
      }
      if (!result?.sent) throw new Error('Nenhum destino aceitou a solicitação de iluminação.');
      const names = result.devices.map((device) => device.name).join(', ');
      const keyboardResult = result.devices.find((device) => device.id === 'womier-sk80');
      if (keyboardResult && keyboardResult.responses < 8) {
        throw new Error('O SK80 não confirmou todas as etapas do protocolo; a cor não foi confirmada.');
      }
      statusMessage = keyboardResult
        ? `SK80 respondeu às etapas do protocolo; confira a cor nos LEDs`
        : `Relatórios enviados para ${names}; confira a iluminação física`;
      if (result.warnings?.length) statusMessage += `. ${result.warnings.join(' ')}`;
      status.lastChild.textContent = ` ${statusMessage}`;
      if (result.warnings?.length) showToast(statusMessage, 'error');
      else showToast(keyboardResult
        ? 'O SK80 respondeu ao protocolo. Confira se a cor mudou nos LEDs.'
        : `Relatórios enviados para ${names}. Confira se a iluminação mudou.`);
    } catch (applyError) {
      statusMessage = applyError?.message || 'Falha ao enviar a configuração ao hardware';
      status.lastChild.textContent = ` ${statusMessage}`;
      showToast(applyError?.message || 'Não foi possível enviar a iluminação.', 'error');
    } finally {
      busy = false;
      apply.removeAttribute('aria-busy');
      updateAvailability();
    }
  });

  setColor(defaults.color);
  updateEffects();
  return { getState, setColor, setState: value => {
    const state = validateLightingRequest(value);
    setColor(state.color); brightness.value = state.brightness; speed.value = state.speed; target.value = state.target;
    updateEffects();
    const input = [...document.querySelectorAll('input[name="effect"]')].find(item => item.value === state.effect);
    if (input) input.checked = true;
    brightness.dispatchEvent(new Event('input', { bubbles: true }));
    speed.dispatchEvent(new Event('input', { bubbles: true }));
    dispatch(); updateAvailability();
  } };
}
