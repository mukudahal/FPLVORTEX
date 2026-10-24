(() => {
  const root = document.documentElement;
  let theme = 'light';
  let colorData = true;
  try {
    const savedTheme = localStorage.getItem('vortex-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') theme = savedTheme;
    colorData = localStorage.getItem('vortex-color-data') !== 'off';
  } catch {}
  function update() {
    root.dataset.theme = theme;
    root.dataset.colorData = colorData ? 'on' : 'off';
    document.querySelectorAll('[data-theme-choice]').forEach(button => {
      button.setAttribute('aria-pressed',String(button.dataset.themeChoice === theme));
    });
    const colorButton = document.querySelector('#color-data');
    if (colorButton) colorButton.setAttribute('aria-pressed',String(colorData));
  }
  update();
  document.addEventListener('DOMContentLoaded',update);
  document.addEventListener('click',event => {
    const themeButton = event.target.closest('[data-theme-choice]');
    if (themeButton) theme = themeButton.dataset.themeChoice;
    else if (event.target.closest('#color-data')) colorData = !colorData;
    else return;
    update();
    try {
      localStorage.setItem('vortex-theme',theme);
      localStorage.setItem('vortex-color-data',colorData ? 'on' : 'off');
    } catch {}
  });
})();
