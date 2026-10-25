let toastRegion;

export function initFeedback() {
  toastRegion = document.getElementById('toast-region');
  document.querySelector('[data-action="sync-now"]')?.addEventListener('click', async () => {
    try {
      await window.prismHub?.devices.refresh();
      showToast('Consulta de dispositivos solicitada.');
    } catch {
      showToast('Não foi possível consultar os dispositivos.', 'error');
    }
  });
  document.querySelector('[data-action="edit-profile"]')?.addEventListener('click', () => {
    showToast('O perfil local não possui edição nesta versão.');
  });
  document.querySelector('[data-action="check-update"]')?.addEventListener('click', () => {
    showToast('A verificação de atualizações estará disponível em uma versão futura.');
  });
  document.querySelector('.icon-button[aria-label="Notificações"]')?.addEventListener('click', () => {
    showToast('Nenhuma notificação nova.');
  });
  document.querySelector('.avatar-button')?.addEventListener('click', () => {
    showToast('Perfil local ativo.');
  });
}

export function showToast(message, tone = 'success') {
  if (!toastRegion) return;
  const toast = document.createElement('div');
  const label = document.createElement('strong');
  toast.className = `toast ${tone === 'error' ? 'error' : ''}`;
  toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  label.textContent = tone === 'error' ? 'Atenção:' : 'Pronto:';
  toast.append(label, document.createTextNode(` ${message}`));
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3200);
}
