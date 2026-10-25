export function initEffects(onChange = () => {}) {
  const grid = document.querySelector('.effects-grid');
  if (!grid) return;
  grid.addEventListener('change', (event) => {
    const input = event.target.closest('input[name="effect"]');
    if (!input) return;
    grid.querySelectorAll('.effect-card').forEach((card) => card.classList.toggle('active', card.contains(input)));
    onChange(input.value);
  });
}
