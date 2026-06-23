# Control Plane Test Report

Status: Phase 3 initial automated slice, 2026-06-23.

## Baseline

- Branch: `main`
- Commit: `b9eea4ac44df6f173073e17782908bd9d0c173ea`
- Commit subject: `feat(control-plane): add durable async scheduler`
- Working tree before edits: clean

## Baseline Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | TypeScript completed. |
| `npm test` | Pass | 22 files, 112 tests. |
| `npm run build` | Pass | Existing Vite chunk-size warning. |
| `npm run eval:golden` | Pass | 37 of 37 golden tasks. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Blocked | `cargo-fmt` is not installed. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Pass | Existing EventKit deprecation warning. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Blocked | `cargo-clippy` is not installed. |
| `cargo test --manifest-path src-tauri/Cargo.toml --all-targets` | Pass | 34 Rust tests before edits. |

## New Evidence

| Area | Evidence | Status |
| --- | --- | --- |
| Per-session event cursor | Rust test `runtime_event_sequences_are_contiguous_per_session`. | Proven by automated test |
| Interleaved frontend sessions | Vitest `ignores interleaved events from another session without creating a false gap`. | Proven by automated test |
| Restart ID uniqueness | Rust test `restart_seeds_generated_ids_from_replayed_event_history`. | Proven by automated test |
| Interrupted restart projection | Rust test `interrupted_request_after_restart_returns_terminal_snapshot`. | Proven by automated test |
| Scheduler empty graph rejection | Rust test `graph_validation_rejects_empty_graph`. | Proven by automated test |
| Scheduler initial state rejection | Rust test `graph_validation_rejects_non_planned_initial_state`. | Proven by automated test |
| Unsupported approval/retry policy rejection | Rust test `graph_validation_rejects_unsupported_approval_and_retry_policies`. | Proven by automated test |

## Phase 3 Verification Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm run typecheck` | Pass | TypeScript completed. |
| `npm test` | Pass | 22 files, 113 tests. |
| `npm run build` | Pass | Existing Vite chunk-size warning. |
| `npm run eval:golden` | Pass | 37 of 37 golden tasks. |
| `cargo check --manifest-path src-tauri/Cargo.toml` | Pass | Existing EventKit deprecation warning. |
| `cargo test --manifest-path src-tauri/Cargo.toml --all-targets` | Pass | 40 Rust tests. |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | Blocked | `cargo-fmt` is not installed. |
| `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings` | Blocked | `cargo-clippy` is not installed. |
| `git diff --check` | Pass | No whitespace errors. |
