# Native Permission Flow QA

## App identity

- Bundle identifier: `com.adaptivesurface.desktop`.
- Installed app: `/Applications/Adaptive Surface.app`.
- Installed executable: `/Applications/Adaptive Surface.app/Contents/MacOS/adaptive-surface`.
- Dev runs may also involve your terminal app or the Tauri dev runner, depending on how `npm run tauri:dev` starts the process.

## Reset TCC permissions

Use these from Terminal when you want a first-run permission prompt again:

```sh
tccutil reset Calendar com.adaptivesurface.desktop
tccutil reset Reminders com.adaptivesurface.desktop
tccutil reset Contacts com.adaptivesurface.desktop
tccutil reset AppleEvents com.adaptivesurface.desktop
```

Full Disk Access cannot be reliably reset only with `tccutil` for this flow. Check it manually in System Settings.

## Built app vs dev app

- Built app: run `/Applications/Adaptive Surface.app`. Add this app to Full Disk Access when testing Mail Envelope Index reads.
- Dev app: run `npm run tauri:dev`. If Mail still reports `Operation not permitted`, add the terminal app or dev runner used to start Tauri to Full Disk Access too.

## Expected prompts

- `show my calendar`: first run should trigger a Calendar privacy prompt. If approved, the command should return real events or a clean empty state.
- `show my reminders`: first run should trigger a Reminders privacy prompt. If approved, the command should return real reminders or a clean empty state.
- `find contact Yurii`: first run should trigger a Contacts privacy prompt. If approved, the command should return matches or a clean empty state.
- `show recent emails`: should not trigger a Calendar/Reminders/Contacts hint. If Full Disk Access is missing, it should say Full Disk Access is needed.
- `show recent notes`: should not trigger a Calendar/Reminders/Contacts hint. It should say local Notes database decoding is unsupported unless the already-running Notes AppleScript fallback succeeds.

## Commands to test in Adaptive Surface

- `show capability status`
- `show my calendar`
- `show my reminders`
- `find contact Yurii`
- `show recent emails`
- `show recent notes`

## Expected states

- Success: provider returns real local data or an empty state that names the provider.
- Denied: provider returns a denied permission state with `didOpenExternalApp=false`.
- Unavailable: provider names the exact manual requirement, such as Full Disk Access for Mail or Notes already running plus Automation for Notes fallback.
- Not acceptable: final Calendar or Reminders error remains `statusRaw=0 status=not_determined` unless the native request call itself failed before prompting, and that exact failure is shown.
