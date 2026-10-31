import { initFeedback } from './modules/feedback.js';
import { initNavigation } from './modules/navigation.js';
import { initLighting } from './modules/lighting.js';
import { initSliders } from './modules/sliders.js';
import { initEffects } from './modules/effects.js';
import { initSwitches } from './modules/toggle.js';
import { initDevices } from './modules/devices.js';
import { initMouse } from './modules/mouse.js';
import { initPreferences } from './modules/preferences.js';
import { initDesktop } from './modules/desktop.js';

document.addEventListener('DOMContentLoaded', () => {
  initFeedback();
  initNavigation();
  const lighting = initLighting();
  initSliders(() => lighting?.getState());
  initEffects();
  initSwitches();
  const mouse = initMouse();
  const preferences = initPreferences();
  initDesktop({ lighting, mouse, preferences });
  initDevices();
});
