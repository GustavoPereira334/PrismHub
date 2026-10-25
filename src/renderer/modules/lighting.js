import { showToast } from './feedback.js';

const defaults = { color: '#7C5CFF', effect: 'estatico', brightness: 80, speed: 55, target: 'all' };

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

  const getState = () => ({
    color: picker.value.toUpperCase(),
    effect: document.querySelector('input[name="effect"]:checked')?.value ?? defaults.effect,
    brightness: Number(brightness.value),
    speed: Number(speed.value),
    target: target.value,
  });

  const dispatch = () => {
    const state = getState();
    document.dispatchEvent(new CustomEvent('prismhub:lighting-change', { detail: state }));
    return state;
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
    preview.dataset.effect = event.detail.effect;
    preview.style.setProperty('--preview-brightness', String(event.detail.brightness / 100));
    const duration = Math.max(0.7, 4.6 - (event.detail.speed * 0.039));
    preview.style.setProperty('--effect-duration', `${duration.toFixed(2)}s`);
  });
  document.querySelector('.effects-grid')?.addEventListener('change', dispatch);
  brightness.addEventListener('input', dispatch);
  speed.addEventListener('input', dispatch);
  target.addEventListener('change', dispatch);
  document.addEventListener('prismhub:devices-updated', (event) => {
    const lightingDevices = event.detail.devices.filter((device) => device.capabilities.lighting === true);
    const available = lightingDevices.length > 0;
    const supportedEffects = new Set(lightingDevices.flatMap((device) => device.lightingEffects || []));
    document.querySelectorAll('input[name="effect"]').forEach((input) => {
      input.disabled = available && !supportedEffects.has(input.value);
      input.closest('.effect-card')?.classList.toggle('disabled', input.disabled);
    });
    const selected = document.querySelector('input[name="effect"]:checked');
    if (selected?.disabled) {
      const fallback = document.querySelector('input[name="effect"]:not(:disabled)');
      if (fallback) { fallback.checked = true; fallback.dispatchEvent(new Event('change', { bubbles: true })); }
    }
    apply.disabled = !available;
    status.lastChild.textContent = available ? ` ${lightingDevices[0].name} pronto para configuração` : ' Nenhum dispositivo com iluminação confirmada';
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
    status.lastChild.textContent = ' pronto para uso';
    showToast('Configuração local restaurada.');
  });

  apply.addEventListener('click', async () => {
    const state = dispatch();
    apply.disabled = true;
    apply.setAttribute('aria-busy', 'true');
    status.lastChild.textContent = ' enviando configuração ao dispositivo...';
    try {
      const result = await window.prismHub?.lighting.apply(state);
      if (!result?.applied) throw new Error('Nenhum dispositivo confirmou a aplicação.');
      status.lastChild.textContent = ` aplicado em ${result.devices[0].name}`;
      showToast(`Iluminação aplicada de verdade em ${result.applied} dispositivo(s).`);
    } catch (error) {
      status.lastChild.textContent = ' falha ao aplicar no hardware';
      showToast(error?.message || 'Não foi possível aplicar a iluminação.', 'error');
    } finally {
      apply.disabled = false;
      apply.removeAttribute('aria-busy');
    }
  });
  setColor(defaults.color);
  return { getState, setColor };
}
