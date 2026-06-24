# Personal Intent Security Control Plane

Adaptive Surface now has a focused personal-use guardrail layer for finalized
control-plane work. The design keeps model output, frontend payloads, connector
content, and external evidence out of the executor path until deterministic Rust
policy authorizes a typed capability operation.

## Practical Invariants

- Models and heuristics can propose intent, but they cannot dispatch an
  operation.
- Every executable work unit must reference a registered semantic capability.
- Unknown capabilities, unavailable capabilities, destructive effects, unknown
  effects, risk mismatches, stale consequential context, over-broad operation
  counts, and external-content authority escalation fail closed.
- Shadow mode is the default. Safe reads and local reversible preparation can
  run; external writes remain proposals only.
- Confirm mode can require one-time approval for an external write, but the
  approval must match the exact current action.
- Approval binding includes operation, plan revision, capability, target,
  normalized input, side-effect class, expected effect, data disclosure, expiry,
  and context revision.
- Executors receive `AuthorizedOperation`, a module-private wrapper created only
  after policy approval or exact one-time approval validation.
- Sensitive data egress is deterministic: restricted data cannot leave local
  boundaries, sensitive data requires approval for cloud or external use, and
  secret-shaped values are denied or redacted from diagnostics and previews.

## Current Vertical Slice

The production migrated path remains inbox triage:

1. Finalized inbox-triage utterance enters `ControlPlaneService`.
2. Rust builds a task graph using `mail.search`, `triage.classify`, and
   `artifact.create`.
3. The scheduler validates the graph and evaluates each work unit through
   `policy.rs`.
4. Allowed work is wrapped as `AuthorizedOperation`.
5. Executors produce typed outcomes only after receiving that wrapper.
6. Artifact creation remains an in-app local artifact; no Mail send, archive,
   delete, label, full-body read, file write, or external connector write is
   added.

## Deferred

This milestone does not implement enterprise RBAC, multiple approvers, remote
audit export, live Mail sending, live Calendar mutation, Slack posting, browser
automation, shell execution, a policy language, or autonomous external writes.
