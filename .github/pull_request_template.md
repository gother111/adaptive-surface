## Summary

<!-- Describe the focused change and why it is needed. -->

## Validation

- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` if Rust, Tauri, native providers, or bridge code changed
- [ ] Not run; reason:

## Safety

- [ ] This change does not broaden macOS permissions, Tauri capabilities, local file access, Apple Events, microphone access, or external app automation.
- [ ] This change does not launch, replace, or build the installed app.
- [ ] Documentation was updated when contributor workflow or user behavior changed.
