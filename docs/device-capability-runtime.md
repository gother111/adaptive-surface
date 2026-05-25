# Device Capability Runtime

The Device Capability Runtime is the local, permissioned layer that lets
Adaptive Surface observe the current Mac context and perform small, inspectable
device actions after user approval.

It is not an autonomous computer-control agent. The first version is scoped to
fast observation, selected-text capture, and reversible text insertion or
replacement.

## Current Capabilities

- Check desktop-control permission status.
- Observe the frontmost app and active window title on macOS.
- Capture selected text with a clipboard plus Cmd+C fallback.
- Paste previewed text into the active app after confirmation.
- Replace the active selection after confirmation.
- Open an app by bundle ID or app name after confirmation.
- Return clean unsupported responses on non-macOS platforms.

The runtime intentionally uses structured return types for every operation so
the frontend can show exactly what was observed, what warning applies, and what
action was attempted.

## Permission Model

The macOS implementation uses fixed internal AppleScript/System Events
fallbacks for app metadata and keyboard shortcuts. The frontend never sends raw
script text or shell commands to the backend.

Permissions reported by the runtime:

- Accessibility: required for synthetic Cmd+C and Cmd+V through System Events.
- Screen Recording: reported, but not required in this version because the
  runtime does not capture screenshots or screen pixels.
- Automation: reported as unknown because macOS may prompt when Adaptive Surface
  asks System Events to run the fixed fallback actions.

If Accessibility is needed, enable Adaptive Surface in:

```text
System Settings > Privacy & Security > Accessibility
```

If macOS does not update immediately after permission changes, restart Adaptive
Surface.

## Clipboard Behavior

Selected-text capture and paste/replace use the clipboard because it is the
smallest practical cross-app fallback for this version.

The runtime attempts to read the current text clipboard, perform the action, and
restore the previous text clipboard when restoreClipboard is enabled. If the
previous clipboard cannot be read as text, the runtime returns a warning instead
of pretending restore was complete.

## Approval Rules

The frontend action broker classifies actions by risk:

- read: can run after the app has the required permissions.
- reversible: requires lightweight UI confirmation.
- external: blocked in this version.
- destructive: blocked in this version.

Paste, replace selection, and open app are reversible actions. They must show a
preview and require explicit confirmation before mutating another app.

## Intentional Non-Goals

This version does not implement:

- arbitrary shell command execution from the frontend
- raw AppleScript execution from the frontend
- coordinate clicking
- autonomous clicking
- hidden background automation
- file deletion
- message sending
- form submission
- purchases
- password or keychain access
- full disk scanning
- screen recording or screenshot analysis
- autonomous multi-step control loops

These constraints keep Adaptive Surface as a local work surface above the
user's work, not a remote-control robot.

## Future Roadmap

- Structured app adapters for browser, Mail, Notes, Finder, Calendar, and
  Reminders.
- Accessibility tree reading for selected UI state without visual clicking.
- Browser extension adapter for tab, selection, and page metadata.
- Screenshot or vision fallback only behind explicit permission and clear
  consent.
- Semantic click-by-label where structured APIs are unavailable.
- Richer approval flows for external actions like sending, submitting, or
  creating externally visible records.
- Better pasteboard preservation for non-text clipboard contents.

## Verification

Safe verification for this layer:

```bash
npm run typecheck
npm test
npm run build
cd src-tauri && cargo check
```

Do not use this runtime as proof of installed-app behavior unless Adaptive
Surface is launched under the actual app process with the relevant macOS
permissions granted.
