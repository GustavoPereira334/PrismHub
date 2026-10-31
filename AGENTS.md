# PrismHub engineering instructions

PrismHub is a Windows Electron application for real hardware discovery and verified control. The source of truth is the code and tests in this repository.

## Non-negotiable rules

- Never fabricate devices, capabilities, telemetry, firmware, battery, temperatures, latency, or successful writes.
- Treat VID/PID as discovery evidence, not proof of a model or protocol revision.
- Keep discovery read-only unless a device adapter has a documented and physically validated write protocol.
- Do not install or replace drivers, flash firmware, or send speculative HID/USB packets.
- Preserve Electron isolation: `contextIsolation: true`, `nodeIntegration: false`, sandbox, web security, restrictive CSP, denied permissions, and blocked external navigation.
- Renderer code receives hardware data only through the preload API and uses safe DOM construction.
- Do not commit, push, publish, or alter unrelated user changes without an explicit request.

## Validation baseline

Run `npm test` and `npm run check`. For renderer changes, also check affected interactions, keyboard behavior, console errors, and 1440×900 plus 1180×760 layouts. Report unverified hardware behavior as unverified.

Use `.github/agents/prismhub-engineer.agent.md` for project-wide work and `.github/agents/prismhub-frontend.agent.md` for renderer-only work.
