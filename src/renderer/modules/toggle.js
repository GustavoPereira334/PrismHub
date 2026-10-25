import { showToast } from './feedback.js';

export function initSwitches() {
  document.querySelectorAll('.toggle-switch[role="switch"]').forEach((button) => {
    button.addEventListener('click', () => {
      const next = button.getAttribute('aria-checked') !== 'true';
      button.setAttribute('aria-checked', String(next));
      button.classList.toggle('active', next);
      if (button.id !== 'realtime-sync') showToast(`Preferência ${next ? 'ativada' : 'desativada'}.`);
    });
  });
}
