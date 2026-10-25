import { initFeedback } from './modules/feedback.js';
import { initNavigation } from './modules/navigation.js';
import { initLighting } from './modules/lighting.js';
import { initSliders } from './modules/sliders.js';
import { initEffects } from './modules/effects.js';
import { initSwitches } from './modules/toggle.js';
import { initDevices } from './modules/devices.js';

document.addEventListener('DOMContentLoaded', () => {
  initFeedback();
  initNavigation();
  const lighting = initLighting();
  initSliders(() => lighting?.getState());
  initEffects();
  initSwitches();
  initDevices();
});
