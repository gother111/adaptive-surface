# Motion and Stability

Motion exists to explain what changed, what stayed, and where an object belongs. The implementation uses CSS and small typed helpers instead of a new motion dependency.

## Motion Tokens

`src/styles.css` defines semantic timing variables for control feedback, content updates, local expansion, structural movement, and stage morphs. `src/surface-system/motion.ts` exposes matching typed motion plans.

## Reduced Motion

Reduced motion plans remove transform travel and keep opacity, border, and background emphasis. CSS also respects `prefers-reduced-motion` globally.

## Protected Interaction

Presentation reconciliation freezes relocation/removal while the user is typing, dictating, dragging, resizing, selecting, reading a new change, or operating a commit control.

## Shell Stability

The app shell uses five semantic zones:

- Continuity bar
- Context rail
- Stage
- Inspector rail
- Interaction dock

Context and inspector rails have persisted open/closed state. The stage keeps a stable reserved region so supporting context does not redefine the main artifact area.
