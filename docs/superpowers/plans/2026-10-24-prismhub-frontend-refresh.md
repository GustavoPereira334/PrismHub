# PrismHub Frontend Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished, complete, responsive PrismHub desktop frontend using the existing vanilla HTML/CSS/JavaScript structure.

**Architecture:** Keep one semantic HTML shell with four view containers and focused ES modules for navigation and RGB interactions. Extend the existing tokenized CSS files instead of adding a framework, dependency, or build step.

**Tech Stack:** HTML5, modular CSS, browser-native ES modules, inline local SVG, Playwright CLI for interaction and visual checks.

**Spec:** `docs/superpowers/specs/2026-10-24-prismhub-frontend-refresh-design.md`

## Global Constraints

- Preserve the user-deleted root `main.js`; do not restore or modify backend files.
- Use only local assets and browser-native APIs.
- Keep all visible copy in Brazilian Portuguese.
- Do not commit unless the user explicitly requests it.
- Avoid unsafe DOM sinks and inline event handlers.

## Review Focus

- Narrow desktop widths must remain usable without horizontal page overflow.
- Keyboard navigation must expose an obvious focus state and active page.
- Color text input must reject invalid hex values without breaking the preview.
- Restore must return every lighting control to the default Aurora profile.
- Repeated navigation and control changes must not create console errors.

---

### Task 1: Complete the semantic application shell

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/ui/_variables.css`
- Modify: `src/ui/_reset.css`
- Modify: `src/ui/layout/sidebar.css`
- Modify: `src/ui/layout/dashboard.css`
- Modify: `src/ui/components/header.css`

**Interfaces:**
- Produces: four `[data-view]` sections selected by sidebar buttons with matching `data-view-target` values.

- [ ] Replace placeholder navigation and empty icon elements with local SVG and accessible buttons.
- [ ] Add Overview, RGB, Devices, and Settings view containers with complete static content.
- [ ] Establish tokens, surface hierarchy, typography, focus, scrollbar, and responsive shell styles.
- [ ] Open the page and verify the initial RGB view renders without console errors.

### Task 2: Build the RGB preview and control system

**Files:**
- Modify: `src/renderer/index.html`
- Modify: `src/ui/components/preview.css`
- Modify: `src/ui/components/controls.css`
- Modify: `src/renderer/modules/sliders.js`
- Modify: `src/renderer/modules/effects.js`
- Create: `src/renderer/modules/lighting.js`

**Interfaces:**
- Produces: `initLighting()` and a `prismhub:lighting-change` custom event with `{ color, effect, brightness, speed, target }` detail.

- [ ] Add original keyboard, mouse, and headset SVG silhouettes to the preview.
- [ ] Style color controls, effect cards, sliders, target selection, and live-sync state.
- [ ] Implement validated color input, presets, live preview updates, and default restore behavior.
- [ ] Verify invalid color input, each effect, sliders, target, restore, and apply feedback in the browser.

### Task 3: Complete navigation, devices, settings, and feedback

**Files:**
- Modify: `src/renderer/renderer.js`
- Modify: `src/renderer/modules/toggle.js`
- Create: `src/renderer/modules/navigation.js`
- Create: `src/renderer/modules/feedback.js`
- Modify: `src/ui/components/devices.css`
- Create: `src/ui/components/views.css`
- Modify: `src/ui/main.css`

**Interfaces:**
- Produces: `initNavigation()`, `initFeedback()`, and `showToast(message, tone)`.

- [ ] Implement view switching, active navigation state, titles, and focus movement.
- [ ] Add complete device cards, search/filter controls, setting switches, profile cards, and activity items.
- [ ] Add accessible toast feedback and non-destructive demo interactions.
- [ ] Verify all view and control flows through repeated interaction.

### Task 4: Responsive and visual verification

**Files:**
- Modify as needed: `src/ui/**/*.css`, `src/renderer/**/*.js`, `src/renderer/index.html`

**Interfaces:**
- Consumes: completed shell and interaction modules from Tasks 1-3.

- [ ] Run JavaScript syntax checks for every renderer module.
- [ ] Check for unsafe DOM sinks, inline handlers, remote resources, and missing CSP.
- [ ] Capture and inspect the RGB view at 1440×900.
- [ ] Inspect every view and key interaction at 1180×760.
- [ ] Fix clipping, overflow, contrast, alignment, focus, and console errors discovered during inspection.
