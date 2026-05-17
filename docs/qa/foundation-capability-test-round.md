# Foundation Capability Test Round

Use this checklist for manual QA of the local-context foundation. Every failure must show a visible command-error surface with adapter name, exact error, permission hint, and suggested next action.

| Spoken phrase | Expected adapter call | Expected surface | Success state | Permission failure state | Empty state |
| --- | --- | --- | --- | --- | --- |
| Show capability status | `load_capability_diagnostics` | `CapabilityStatusSurface` | Cards for Mail, Calendar, Reminders, Notes, Contacts, Files, Google Calendar, Google Drive with true status | Card shows `needs-permission`, last error, and macOS Automation instructions | Not applicable |
| Show recent emails | `load_mail_messages` | `EmailListSurface` | Real Apple Mail inbox messages with sender, subject, mailbox, date, preview | `CommandErrorSurface` names Apple Mail and shows Automation permission hint | Email list says Apple Mail returned no messages |
| Open the latest email fully | `read_mail_message` using latest loaded id | `EmailDetailSurface` | Full email body, not the short preview | `CommandErrorSurface` shows exact Apple Mail read error | If no prior email list, visible error says to show recent emails first |
| Show today's calendar | `load_calendar_events` with `daysAhead: 1` | `CalendarDaySurface` | Real Calendar events with title/time/calendar/location | `CommandErrorSurface` names Calendar and shows Automation permission hint | Calendar surface says no events for today |
| Create a calendar event tomorrow at 10 called Test Event | `create_calendar_event` after approval | `ApprovalSurface`, then `CalendarDaySurface` | Approval preview appears; saying approve creates real event | `CommandErrorSurface` shows Calendar write error | Not applicable |
| Show my reminders | `load_reminders` | `ReminderListSurface` | Real open reminders with list and due date | `CommandErrorSurface` names Reminders and shows Automation permission hint | Reminder list says no open reminders |
| Create a reminder to test Seemless tomorrow morning | `create_reminder` after approval | `ApprovalSurface`, then `ReminderListSurface` | Approval preview appears; saying approve creates real reminder | `CommandErrorSurface` shows Reminders write error | Not applicable |
| Show recent notes | `load_notes` | `NotesListSurface` | Real Apple Notes list with title/folder/date/preview | `CommandErrorSurface` names Notes and shows Automation permission hint | Notes list says no notes returned |
| Open the full latest note | `read_note` using latest loaded id | `NoteDetailSurface` | Full note body, not the preview truncation | `CommandErrorSurface` shows exact Notes read error | If no prior notes list, visible error says to show recent notes first |
| Create a note called Seemless Test Note | `create_note` after approval | `ApprovalSurface`, then `NoteDetailSurface` | Approval preview appears; saying approve creates real note | `CommandErrorSurface` shows Notes write error | Not applicable |
| Find contacts named Yurii | `search_contacts` | `ContactsSurface` | Real Apple Contacts matches with display name, emails, phones, organization | `CommandErrorSurface` names Contacts and shows Automation permission hint | Contacts surface says no matches |
| Show files from Desktop | `search_local_files` with root `Desktop` | `FilesSurface` | Real Desktop files from trusted root with path/extension/size/readable type | `CommandErrorSurface` shows filesystem error | Files surface says no matching files |
| Search my Documents for PDF files | `search_local_files` with root `Documents`, extension `pdf` | `FilesSurface` | Real PDF files from Documents | `CommandErrorSurface` shows filesystem error | Files surface says no matching PDFs |
| Open this file summary | `read_local_file` using latest loaded file path | `FileDetailSurface` | Supported text file shows preview/chunks | Unsupported PDF/DOCX/XLSX says indexed but not readable in this milestone | If no prior file, visible error says to search files first |

## Stability Checks

- These commands must not destroy the existing primary surface unless the user says `start over`, `clear`, or `new workspace`.
- The main workspace must not be replaced by the intent analyzer.
- Partial transcripts may update live debug/caption state only.
- Write actions must show `ApprovalSurface` first.
- Sending email remains disabled unless a future explicit confirmation flow is built.
