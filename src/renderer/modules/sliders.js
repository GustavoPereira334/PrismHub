export function initSliders(onChange = () => {}) {
  document.querySelectorAll('.range-group').forEach((group) => {
    const input = group.querySelector('input[type="range"]');
    const output = group.querySelector('output');
    if (!input || !output) return;
    const update = () => {
      output.textContent = `${input.value}%`;
      input.style.setProperty('--range-value', `${input.value}%`);
      onChange(input.id, Number(input.value));
    };
    input.addEventListener('input', update);
    update();
  });
}
