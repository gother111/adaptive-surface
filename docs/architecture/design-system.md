# Frontend Design System

Adaptive Surface now uses semantic CSS tokens as the source of visual truth. Component code should consume tokens through Tailwind theme names or shared classes such as `surface-panel`, `surface-subpanel`, `surface-row`, `surface-toolbar`, and the motion classes in `src/styles.css`.

## Theme Model

`src/surface-system/theme.tsx` owns `system`, `light`, and `dark` preferences. It resolves system preference, persists the user override in `localStorage`, applies classes on `document.documentElement`, and keeps `color-scheme` in sync.

`index.html` contains a small first-paint script so the document receives the right light or dark class before React loads.

## Palette Direction

Light theme uses a soft neutral canvas, near-white working surfaces, restrained borders, and mineral indigo accent. Dark theme uses graphite surfaces rather than pure black. Success, warning, error, and info are semantic colors and should be paired with text or icons.

## Rules

- Do not add component-specific dark or light colors.
- Do not reintroduce neon green/cyan, glowing borders, or colored shadows as brand styling.
- Use borders and spacing before shadows.
- Use macOS/system typography; do not add novelty fonts without a product reason.
