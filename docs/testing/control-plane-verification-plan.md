# Control Plane Verification Plan

Status: Phase 3 initial plan, 2026-06-23.

## Scope

This plan verifies the migrated Rust-owned inbox-triage execution substrate, not a new workflow or agent runtime. It covers per-session runtime events, durable accepted requests, scheduler validation, startup reconciliation, frontend projection, and privacy/security risks.

## Automated Layers

1. Rust scheduler/service tests for graph validation, cancellation, timeout, accepted-run durability, per-session event sequences, duplicate request identity, and interrupted restart.
2. TypeScript reducer/store tests for duplicate delivery, stale events, gap handling, unsupported protocol, interleaved sessions, browser mock parity, and failure projection.
3. Golden evals for foundation routing and approval safety.
4. Build/type checks for frontend and Rust.

## Commands

```bash
npm run typecheck
npm test
npm run build
npm run eval:golden
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-targets
```

`rustfmt` and `clippy` are currently environment-blocked on this machine because those Rust components are not installed.

## Next Automated Gaps

- Add repository transaction rollback and schema-version tests.
- Add fixture-backed SQLite replay benchmarks and opt-in soak tests.
- Add mocked Tauri `invoke` and `listen` frontend contract tests.
- Add privacy regression tests for persisted migrated inbox-triage payloads.
- Add CI once the command set is stable.

## Manual Scope

Manual native checks require explicit approval before launching or replacing `/Applications/Adaptive Surface.app`. Until then, all native and screenshot/Appshot items remain not executed.

