# Native Provider Root Cause

## Bundle and plist

- Current bundle identifier: `com.adaptivesurface.desktop` from `src-tauri/tauri.conf.json`.
- Current privacy keys in `src-tauri/Info.plist`:
  - `NSAppleEventsUsageDescription`
  - `NSCalendarsFullAccessUsageDescription`
  - `NSContactsUsageDescription`
  - `NSMicrophoneUsageDescription`
  - `NSRemindersFullAccessUsageDescription`
  - `NSSpeechRecognitionUsageDescription`

## Current failure proof

- Calendar read path: `src-tauri/src/providers/calendar_provider.rs` calls `eventkit_bridge::calendar_events_json`, which enters `adaptive_calendar_events_json` in `src-tauri/src/native_helpers/eventkit_bridge.m`.
- Reminders read path: `src-tauri/src/providers/reminders_provider.rs` calls `eventkit_bridge::reminders_json`, which enters `adaptive_reminders_json` in `src-tauri/src/native_helpers/eventkit_bridge.m`.
- Previous failure: `ASEnsureAccess` only checked `authorizationStatusForEntityType`; when macOS returned `statusRaw=0 status=not_determined`, it returned a permission error instead of requesting access. Runtime could never reach the system prompt.
- Fixed architecture: `ASEnsureAccess` now requests access inside the Adaptive Surface process when status is `not_determined`, using `requestFullAccessToEventsWithCompletion` for Calendar and `requestFullAccessToRemindersWithCompletion` for Reminders on modern macOS, with deprecated `requestAccessToEntityType` only as the compatibility fallback.
- Calendar and Reminders do not open Calendar or Reminders and do not use AppleScript for reads.

## Contacts

- Previous Contacts path: `src-tauri/src/providers/contacts_provider.rs` generated a temporary Swift script and ran it through `run_swift_helper` in `src-tauri/src/providers/mod.rs`, which launches `/usr/bin/swift`.
- Why that failed honestly: macOS privacy prompts are tied to the requesting process. A helper process is not the same as the Adaptive Surface app process, so granting the app does not prove the helper can search contacts.
- Fixed architecture:
  - `src-tauri/src/native_helpers/contacts_bridge.m`
  - `src-tauri/src/providers/contacts_bridge.rs`
  - `src-tauri/src/providers/contacts_provider.rs`
- The bridge uses `CNContactStore.authorizationStatusForEntityType`, calls `requestAccessForEntityType` when status is `not_determined`, and searches contacts in-process without requesting contact notes.

## Mail

- Current Mail strategy: `src-tauri/src/providers/mail_provider.rs` reads Apple Mail metadata from `~/Library/Mail/**/MailData/Envelope Index` through `/usr/bin/sqlite3`.
- That strategy requires Full Disk Access when macOS protects `~/Library/Mail`.
- Previous failure: diagnostics treated the presence of `~/Library/Mail` or an Envelope Index path as enough, then collapsed `Operation not permitted` into generic unavailable state.
- Fixed architecture: Mail diagnostics now distinguish:
  - `full_disk_access_missing`
  - `mail_library_not_found`
  - `mail_v_folder_not_found`
  - `envelope_index_not_found`
  - `envelope_index_unreadable`
  - `sqlite_query_failed`
  - Mail not running for fallback
  - Automation denied or fallback timeout through the AppleScript error path
- Mail is not opened automatically. AppleScript fallback is attempted only when Mail is already running. The fallback timeout is 12 seconds.

## Notes

- Current Notes provider: `src-tauri/src/providers/notes_provider.rs`.
- Local Notes database decoding is not implemented.
- The only read/list fallback is AppleScript, and it only works if Notes is already running and Automation permission exists.
- Fixed honesty states:
  - `unsupported_local_db`
  - `fallback_requires_notes_running`
  - `fallback_requires_automation`
  - `fallback_timeout`
- Adaptive Surface still does not claim Notes is a true native local database provider.

## Why previous tests passed

- The existing tests focused on routing, no-app-opening invariants, lifecycle stability, and broad adapter error handling.
- They did not assert that `statusRaw=0` triggers a native request flow.
- They did not assert that Contacts avoids `/usr/bin/swift`.
- They did not classify Mail `Operation not permitted` as Full Disk Access missing.
- They did not check that error upserts replace stale loading props such as `Calling the local adapter now.`

## Debug command

- Added Tauri command: `load_native_permission_debug`.
- It returns JSON with:
  - app bundle identifier
  - executable path
  - EventKit Calendar raw and semantic status
  - EventKit Reminders raw and semantic status
  - Contacts raw and semantic status
  - Mail diagnostics including `HOME`, `~/Library/Mail`, Envelope Index readability, read errors, Full Disk Access classification, and whether Mail is running
  - Notes diagnostics including local DB existence, whether Notes is running, and `localDecodingImplemented=false`
  - `didOpenExternalApp=false`
