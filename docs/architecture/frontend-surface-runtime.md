# Frontend Surface Runtime

Adaptive Surface keeps the existing backend and workspace contracts while adding a frontend-facing surface-system layer under `src/surface-system/`.

## Runtime Contracts

`src/surface-system/contracts.ts` defines typed frontend recipes, nodes, zones, archetypes, patch operations, and recipe validation. This layer is intentionally not an authoritative backend graph. It describes presentation semantics for the renderer.

## State Ownership

- Domain state remains in the existing store, Rust commands, and backend/control-plane contracts.
- Surface state is the active recipe or existing `WorkspaceSession`.
- Presentation state is local to React: rail state, focus, selection, scroll, pins, and manual sizing.
- Ephemeral state remains local hover, pointer, and animation state.

## Reconciliation

`src/surface-system/reconciliation.ts` applies typed patches only when their session and base revision match. Structural relocation or removal is deferred while protected interaction is active or when a focused, selected, pinned, or manually sized node would be moved.

## Representative Sequence

`src/surface-system/fixtures.ts` provides a deterministic Explorer to Matrix to Brief to Editor to Review sequence. Source artifacts retain stable IDs across archetype changes so tests can verify object continuity without relying on backend availability.
