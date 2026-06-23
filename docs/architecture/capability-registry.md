# Capability Registry

Capabilities are the action boundary for Adaptive Surface.

For migrated backend-control-plane routes, Rust is the canonical semantic
capability authority. The first live descriptors are:

- `mail.search`: Apple Mail metadata retrieval only, `safe_read`,
  `SideEffectClass::None`, no approval requirement.
- `triage.classify`: deterministic local classification from metadata,
  `safe_read`, no approval requirement.
- `artifact.create`: in-app artifact envelope creation, `local_write`,
  `SideEffectClass::LocalReversible`, no disk write and no external mutation.

Risk levels:

- `safe_read`: can run after local permission exists.
- `local_write`: should preview or require light confirmation.
- `external_write`: always requires explicit approval.
- `destructive`: always requires explicit approval.

`mail.send` and `calendar.create_event` are always approval-gated. `reminders.create` previews before a real write. File reads must stay inside trusted roots.

Missing adapters return structured `not_implemented` results, so the app can show a graceful state without pretending an action happened.

Frontend registries remain compatibility projections for non-migrated routes and
UI diagnostics. They must not become a second policy authority for migrated
semantic IDs.
