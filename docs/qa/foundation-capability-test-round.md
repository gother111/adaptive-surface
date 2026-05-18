# Foundation Capability Test Round

Use this checklist for manual QA of the local-context foundation. Every failure must show a visible command-error surface with adapter name, exact error, permission hint, and suggested next action. Run each phrase through both the microphone and the typed command bar at the bottom of the app so command handling can be separated from dictation reliability.

| Spoken phrase | Expected adapter call | Expected surface | Success state | Permission failure state | Empty state |
| --- | --- | --- | --- | --- | --- |
| Show capability status | `load_capability_diagnostics` | `CapabilityStatusSurface` | Cards for Mail, Calendar, Reminders, Notes, Contacts, Files, Google Calendar, Google Drive with true status. Diagnostics must not open Apple apps. | Card shows `needs-permission`, last error, and native macOS privacy instructions | Not applicable |
| Show recent emails | `load_mail_messages` | `EmailListSurface` | Real Apple Mail metadata from Envelope Index with sender, subject, mailbox, date, preview. Mail must remain closed. | `CommandErrorSurface` names provider and shows exact error. Mail must remain closed. | Email list says no messages or unavailable without opening Mail |
| Open the latest email fully | `read_mail_message` using latest loaded id | `EmailDetailSurface` | Full email body, not the short preview | `CommandErrorSurface` shows exact Apple Mail read error | If no prior email list, visible error says to show recent emails first |
| Show today's calendar | `load_calendar_events` with `daysAhead: 1` | `CalendarDaySurface` | Real Calendar events with title/time/calendar/location. Calendar must remain closed. | `CommandErrorSurface` names EventKit provider and shows Calendar privacy permission hint | Calendar surface says no events for today |
| Create a calendar event tomorrow at 10 called Test Event | `create_calendar_event` after approval | `ApprovalSurface`, then `CalendarDaySurface` | Approval preview appears; saying approve creates real event | `CommandErrorSurface` shows Calendar write error | Not applicable |
| Show my reminders | `load_reminders` | `ReminderListSurface` | Real open reminders with list and due date. Reminders must remain closed. | `CommandErrorSurface` names EventKit provider and shows Reminders privacy permission hint | Reminder list says no open reminders |
| Create a reminder to test Seemless tomorrow morning | `create_reminder` after approval | `ApprovalSurface`, then `ReminderListSurface` | Approval preview appears; saying approve creates real reminder | `CommandErrorSurface` shows Reminders write error | Not applicable |
| Show recent notes | `load_notes` | `NotesListSurface` | Real Notes only if a non-opening provider is available. Notes must remain closed. | `CommandErrorSurface` says local Notes decoding is unavailable or fallback requires Notes already running | Notes list says no notes returned |
| Open the full latest note | `read_note` using latest loaded id | `NoteDetailSurface` | Full note body only if a non-opening provider or already-running fallback is available | `CommandErrorSurface` shows exact Notes read error and says whether an external app opened | If no prior notes list, visible error says to show recent notes first |
| Create a note called Seemless Test Note | `create_note` after approval | `ApprovalSurface`, then `NoteDetailSurface` | Approval preview appears; unsupported native create returns an honest error | `CommandErrorSurface` shows Notes write unsupported/unavailable | Not applicable |
| Find contacts named Yurii | `search_contacts` | `ContactsSurface` | Real Apple Contacts matches with display name, emails, phones, organization. Contacts must remain closed. | `CommandErrorSurface` names Contacts.framework provider and shows Contacts privacy permission hint | Contacts surface says no matches |
| Show files from Desktop | `search_local_files` with root `Desktop` | `FilesSurface` | Real Desktop files from trusted root with path/extension/size/readable type | `CommandErrorSurface` shows filesystem error | Files surface says no matching files |
| Search my Documents for PDF files | `search_local_files` with root `Documents`, extension `pdf` | `FilesSurface` | Real PDF files from Documents | `CommandErrorSurface` shows filesystem error | Files surface says no matching PDFs |
| Open this file summary | `read_local_file` using latest loaded file path | `FileDetailSurface` | Supported text file shows preview/chunks | Unsupported PDF/DOCX/XLSX says indexed but not readable in this milestone | If no prior file, visible error says to search files first |

## Short Phrase Regression Checks

These short forms should route to the same adapters as the fuller spoken phrases:

- `recent emails`
- `calendar today`
- `reminders`
- `notes`
- `latest note`
- `find Yurii`
- `desktop files`
- `documents pdf`

## Stability Checks

- These commands must not destroy the existing primary surface unless the user says `start over`, `clear`, or `new workspace`.
- The main workspace must not be replaced by the intent analyzer.
- Partial transcripts may update live debug/caption state only.
- Write actions must show `ApprovalSurface` first.
- Sending email remains disabled unless a future explicit confirmation flow is built.
- Capability status must run real adapter probes; a shallow app-launch check is not enough.
- AppleScript adapter calls must time out with a visible error rather than spinning forever.

## No-App-Opening Test Round

Start with Mail, Calendar, Notes, Reminders, and Contacts closed.

1. Say `show recent emails`.
   - Mail must remain closed.
   - The app must show real email metadata from Envelope Index or a readable unavailable/error state.
2. Say `show my calendar`.
   - Calendar must remain closed.
   - The app must show real events or a Calendar privacy/error state.
3. Say `show reminders`.
   - Reminders must remain closed.
   - The app must show reminders or a Reminders privacy/error state.
4. Say `find contact Yurii`.
   - Contacts must remain closed.
   - The app must show contacts or a Contacts privacy/error state.
5. Say `show notes`.
   - Notes must remain closed.
   - The app must show notes only if a non-opening provider is available, otherwise an honest unavailable state.
6. Say `show files from Desktop`.
   - Finder must not open.
   - The app must show local file results from the trusted Desktop root.
7. Confirm the workspace uses main, left rail, right rail, and bottom dock zones instead of piling every surface into the left column.
