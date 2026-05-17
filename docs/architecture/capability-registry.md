# Capability Registry

Capabilities are the action boundary for Adaptive Surface.

Risk levels:

- `safe_read`: can run after local permission exists.
- `local_write`: should preview or require light confirmation.
- `external_write`: always requires explicit approval.
- `destructive`: always requires explicit approval.

`mail.send` and `calendar.create_event` are always approval-gated. `reminders.create` previews before a real write. File reads must stay inside trusted roots.

Missing adapters return structured `not_implemented` results, so the app can show a graceful state without pretending an action happened.
