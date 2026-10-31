const pages = {
  overview: { eyebrow: 'CENTRAL', title: 'Visão geral', subtitle: 'Acompanhe todo o seu setup em um só lugar.' },
  rgb: { eyebrow: 'ILUMINAÇÃO', title: 'Iluminação RGB', subtitle: 'Sincronize cores e efeitos em todos os seus dispositivos.' },
  devices: { eyebrow: 'HARDWARE', title: 'Dispositivos', subtitle: 'Gerencie periféricos, conexões e perfis individuais.' },
  mouse: { eyebrow: 'PERIFÉRICOS', title: 'Mouse', subtitle: 'Configure DPI, polling rate e controles do mouse compatível.' },
  keyboard: { eyebrow: 'PERIFÉRICOS', title: 'Teclado', subtitle: 'Configure teclas, macros e iluminação do teclado compatível.' },
  settings: { eyebrow: 'PREFERÊNCIAS', title: 'Configurações', subtitle: 'Personalize a experiência e o comportamento do PrismHub.' },
};

export function initNavigation() {
  const links = [...document.querySelectorAll('[data-view-target]')];
  const views = [...document.querySelectorAll('[data-view]')];
  const title = document.getElementById('page-title');
  const subtitle = document.getElementById('page-subtitle');
  const eyebrow = document.getElementById('page-eyebrow');

  function openView(name, moveFocus = true) {
    const nextView = views.find((view) => view.dataset.view === name);
    if (!nextView || !pages[name]) return;
    links.forEach((link) => {
      const active = link.dataset.viewTarget === name;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    views.forEach((view) => {
      const active = view === nextView;
      view.hidden = !active;
      view.classList.toggle('active', active);
    });
    eyebrow.textContent = pages[name].eyebrow;
    title.textContent = pages[name].title;
    subtitle.textContent = pages[name].subtitle;
    document.title = `${pages[name].title} • PrismHub`;
    document.getElementById('main-content').scrollTop = 0;
    if (moveFocus) nextView.focus({ preventScroll: true });
  }

  links.forEach((link) => link.addEventListener('click', () => openView(link.dataset.viewTarget)));
  document.querySelectorAll('[data-go-to]').forEach((button) => button.addEventListener('click', () => openView(button.dataset.goTo)));
  openView('overview', false);
  return { openView };
}
