import type {
  AppleCalendarEvent,
  AppleMailMessage,
  AppleNotePreview,
  LocalContextPreview,
  LocalContextRecentFile,
} from "@/types/context";
import { createWorkObject } from "@/work-objects/work-object-factory";
import type { ReminderObject, WorkObject } from "@/work-objects/work-object-types";

export interface AppleReminderPreview {
  id: string;
  title: string;
  listName?: string;
  dueAt?: string | null;
  completed?: boolean;
  notes?: string | null;
}

export function normalizeAppleMailMessagesToWorkObjects(messages: AppleMailMessage[]): WorkObject[] {
  return messages.map((message) =>
    createWorkObject({
      kind: "email_message",
      source: "apple_mail",
      title: message.subject || "(No subject)",
      subtitle: [message.sender, message.mailbox].filter(Boolean).join(" | "),
      contentPreview: message.preview ?? undefined,
      rawRef: message.id,
      confidence: 0.92,
      metadata: {
        sender: message.sender,
        mailbox: message.mailbox,
        receivedAt: message.receivedAt,
        isRead: message.isRead,
      },
    }),
  );
}

export function normalizeAppleCalendarEventsToWorkObjects(events: AppleCalendarEvent[]): WorkObject[] {
  return events.map((event) =>
    createWorkObject({
      kind: "calendar_event",
      source: "apple_calendar",
      title: event.title || "Untitled event",
      subtitle: [event.startAt, event.calendarName].filter(Boolean).join(" | "),
      contentPreview: event.notes ?? event.location ?? undefined,
      rawRef: event.id,
      confidence: 0.94,
      metadata: {
        calendarName: event.calendarName,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
      },
    }),
  );
}

export function normalizeAppleNotesToWorkObjects(notes: AppleNotePreview[]): WorkObject[] {
  return notes.map((note) =>
    createWorkObject({
      kind: "note",
      source: "apple_notes",
      title: note.title || "Untitled note",
      subtitle: note.folder,
      contentPreview: note.preview ?? undefined,
      rawRef: note.id,
      confidence: 0.9,
      metadata: {
        folder: note.folder,
        createdAtSource: note.createdAt,
        modifiedAtSource: note.modifiedAt,
      },
    }),
  );
}

export function normalizeAppleRemindersToWorkObjects(reminders: AppleReminderPreview[] = []): WorkObject[] {
  return reminders.map((reminder) =>
    createWorkObject({
      kind: "reminder",
      source: "apple_reminders",
      title: reminder.title || "Untitled reminder",
      subtitle: reminder.listName,
      contentPreview: reminder.notes ?? undefined,
      rawRef: reminder.id,
      confidence: 0.88,
      metadata: {
        dueAt: reminder.dueAt,
        listName: reminder.listName,
        completed: reminder.completed,
      },
    }) as ReminderObject,
  );
}

export function normalizeFileDirectoryToWorkObjects(preview: LocalContextPreview): WorkObject[] {
  const files = preview.recentFiles.map((file) => fileToWorkObject(file, preview.trustedRoots));
  const trustedRoots = preview.trustedRoots.map((root) =>
    createWorkObject({
      kind: "directory",
      source: "local_directory",
      title: root.split("/").filter(Boolean).at(-1) ?? root,
      subtitle: root,
      rawRef: root,
      confidence: 0.86,
      metadata: { path: root, trustedRoot: root },
    }),
  );

  return [...trustedRoots, ...files];
}

function fileToWorkObject(file: LocalContextRecentFile, trustedRoots: string[]) {
  const extension = file.path.split(".").at(-1)?.toLowerCase();
  const trustedRoot = trustedRoots.find((root) => file.path === root || file.path.startsWith(`${root}/`));
  const kind = extension === "pdf" || extension === "docx" || extension === "txt" || extension === "md"
    ? "document"
    : extension === "csv" || extension === "xlsx"
      ? "spreadsheet"
      : "file";

  return createWorkObject({
    kind,
    source: "local_directory",
    title: file.path.split("/").filter(Boolean).at(-1) ?? file.path,
    subtitle: file.path,
    rawRef: file.path,
    confidence: trustedRoot ? 0.9 : 0.45,
    metadata: {
      path: file.path,
      extension,
      modifiedAtMs: file.modifiedAtMs,
      trustedRoot,
    },
  });
}
