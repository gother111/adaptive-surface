# Security Pack Verification Plan

## Automated Checks

Run:

```bash
npm run security:verify-vendor
npm test -- src/test/security-pack-foundation.test.ts
npm run typecheck
npm test
npm run build
```

For Rust or Tauri changes in a later phase:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## Current Coverage

`src/test/security-pack-foundation.test.ts` covers:

- exactly eight manifests
- pinned source commit and release
- source hash agreement with `UPSTREAM.lock.json`
- no retained upstream executable scripts
- positive and negative routing
- disabled feature filtering
- lazy curated procedure loading
- policy denial for unknown capability, unsafe path, and disabled adapter
- approval requirement for scoped Gitleaks execution
- advisory prompt-injection signals
- sensitive-value redaction
- MCP canonicalization, static findings, and baseline drift
- current Gitleaks command families
- redacted Gitleaks JSON parsing
- native threat model creation without Threat Dragon
- CycloneDX parsing
- Sigstore wrong-identity failure
- in-toto unauthorized functionary failure

## Manual Checks

When dedicated UI is added:

1. Speak "Review this MCP server before I connect it."
2. Confirm the first surface appears immediately and does not run a scanner.
3. Select an MCP config fixture.
4. Confirm the inventory, findings, baseline diff, and approval boundary are
   visible.
5. Speak "Scan this repository for leaked secrets."
6. Confirm scope and tool status appear before any executable preflight.
7. Cancel the action and confirm no report file remains.
8. Speak "Threat-model this integration."
9. Confirm entities, flows, trust boundaries, assumptions, and risks are
   editable without Threat Dragon installed.

Do not run manual checks against `/Applications/Adaptive Surface.app` without
the user's explicit request to launch or replace the installed app.
