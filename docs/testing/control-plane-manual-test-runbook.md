# Control Plane Manual Test Runbook

Status: not executed in this Phase 3 automated slice.

Do not run this against the installed app without explicit approval.

## Browser Fixture Mode

1. Start the web dev server only if approved for UI verification.
2. Submit `Catch me up on inbox triage.`
3. Expected: immediate speculative/local acknowledgement, accepted loading surface, browser mock artifact, no native permission prompt, no console errors.
4. Evidence: screenshot of loading and final artifact, console log check, test notes.

## Tauri Fixture Mode

Prerequisite: a test-only fixture provider and isolated control-plane SQLite path. This repo does not yet expose a complete fixture desktop profile.

Scenarios:
- accepted response before completion;
- listener reconnect and catch-up;
- duplicate client request;
- cancellation and timeout;
- interrupted restart;
- more than one catch-up page.

## Real macOS Read-Only Smoke

Only run with explicit approval.

1. Launch the approved test app instance.
2. Submit `Catch me up on inbox triage.`
3. Verify Mail remains read-only and no reply, send, archive, delete, or label change occurs.
4. Verify final artifact shows `writesToDisk=false`, `writesToMailbox=false`, and `fullBodiesRead=false`.
5. Redact screenshots if any personal Mail metadata is visible.

## Current Status

No browser, Tauri, installed-app, screenshot, Appshot, microphone, Full Disk Access, or real Mail manual scenario was executed in this pass.

