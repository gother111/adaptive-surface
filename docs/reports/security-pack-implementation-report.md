# Security Pack Implementation Report

## Summary

Adaptive Surface now has a curated Security Pack foundation for the eight
allowlisted upstream cybersecurity skills. The implementation is local-first,
metadata-routed, policy-gated, and reference-only for raw upstream material.

## Repository Architecture Discovered

- React 19, TypeScript, Vite, Tailwind v4, Zustand, and Tauri 2.
- Existing deterministic intent classifier in `src/intent/`.
- Existing local capability and approval scaffold in `src/capabilities/`.
- Existing Rust control-plane and approval concepts under
  `src-tauri/src/control_plane/`.
- Existing documentation under `docs/architecture`, `docs/testing`, and
  `docs/reports`.
- No existing Security Pack or feature-flag module.

## Architecture Implemented

- `third_party/anthropic-cybersecurity-skills/`: pinned raw reference source.
- `scripts/security-pack-vendor.mjs`: deterministic vendor refresh.
- `scripts/security-pack-verify-vendor.mjs`: integrity verification.
- `src/security-pack/`: typed manifests, feature flags, routing, policy,
  guardrails, MCP review, secret scan parsing, threat modeling, and
  verification-only supply-chain helpers.
- `src/intent/`: security phrasing now opens a non-executing Security Console
  style research surface.

## Source Snapshot

- Release: `v1.3.0`
- Commit: `101ca0bd887a295e39cc20a100efa571937ca969`
- Aggregate retained source SHA-256:
  `821980335c8c2c32892f9aba1631c0b0979111503b0d7d4fcd2fc9a8c2df365a`
- License and notice: present.
- Upstream scripts: excluded.
- Executable bits: stripped.

## Security Boundaries

- Unknown capability: denied.
- Unknown executable adapter: denied.
- Disabled experimental adapter: denied.
- Path traversal or outside-root path: denied.
- Undeclared network destination: denied.
- Destructive operations, signing, publication, key generation, and active
  probing: denied in this MVP.
- Prompt-injection detection: advisory only.
- Raw secrets: redacted before UI, logs, audit, or parsed findings.

## New Dependencies

None.

## Tauri Permissions

No Tauri configuration or capability file was changed. No shell, filesystem, or
native permission surface was broadened.

## Test Coverage

Added `src/test/security-pack-foundation.test.ts` with 10 focused tests covering
provenance, vendoring, routing, policy, guardrails, MCP review, Gitleaks parsing,
threat modeling, SBOM parsing, Sigstore evidence, and in-toto checks.

## Performance

Routing and policy are synchronous metadata-only functions. No network request
runs during startup. No raw upstream Markdown is parsed at runtime. The route
function records `durationMs` so a later benchmark can enforce the 30 ms p95
target.

## Known Limitations

- No native Rust/Tauri Security Pack process runner yet.
- No dedicated Security Pack UI components yet.
- Experimental supply-chain workflows are off by default and verification-only.
- Native symlink resolution must be added with the future Rust runner.

## Recommended Next Step

Implement the Rust/Tauri Security Pack execution service as a separate
plan-first change: allowlisted executable IDs, canonicalized workspace roots,
realpath and symlink checks, minimal environment, timeout, output limits,
cancellation, and structured events.
