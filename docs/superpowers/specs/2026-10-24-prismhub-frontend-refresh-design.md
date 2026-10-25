# PrismHub Frontend Refresh Design

## Intent

Refine the existing PrismHub vanilla HTML/CSS/JavaScript frontend into a polished Windows desktop control center while preserving its dark violet/cyan visual identity and current modular file layout.

## Scope

- Complete the sidebar and four navigable views: Overview, RGB Lighting, Devices, and Settings.
- Make RGB color, presets, effects, brightness, speed, target, live sync, restore, and apply interactions visibly functional.
- Replace empty placeholders with original inline SVG device and navigation artwork.
- Add responsive layouts, accessible focus and status feedback, and reduced-motion support.
- Keep all resources local and keep the renderer independent from Node/Electron internals.

## Approach

Use the existing renderer and CSS structure rather than introducing a framework or bundler. The document keeps stable, semantic view containers; small ES modules own navigation, lighting state, sliders, switches, and safe DOM feedback. CSS custom properties and component files continue to own the design system.

## Visual direction

The refresh keeps the current black/plum surfaces and PrismHub gradient, adds clearer surface hierarchy, softer cyan/violet lighting, denser desktop spacing, and original hardware silhouettes. It should feel like a premium peripheral utility rather than a generic admin dashboard.

## Constraints

- Do not restore or alter the user-deleted root `main.js`.
- Do not add remote fonts, icons, scripts, or dependencies.
- Avoid inline event handlers, eval-like APIs, and dynamic HTML injection.
- Preserve Portuguese UI copy.
- Validate at 1440×900 and a narrower desktop viewport.

## Completion

The frontend is complete when all four views navigate, RGB controls update the preview, restore/apply actions produce feedback, device and setting controls behave coherently, the layout remains usable at narrower widths, and browser checks show no console errors.
