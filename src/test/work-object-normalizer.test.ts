import { describe, expect, it } from "vitest";
import {
  normalizeAppleCalendarEventsToWorkObjects,
  normalizeAppleMailMessagesToWorkObjects,
  normalizeAppleNotesToWorkObjects,
  normalizeAppleRemindersToWorkObjects,
  normalizeFileDirectoryToWorkObjects,
} from "@/work-objects/work-object-normalizer";

describe("work object normalizers", () => {
  it("normalizes mail messages", () => {
    const [object] = normalizeAppleMailMessagesToWorkObjects([
      { id: "m1", mailbox: "Inbox", subject: "Hello", sender: "Jacob", isRead: false, preview: "Talk notes" },
    ]);
    expect(object.kind).toBe("email_message");
    expect(object.source).toBe("apple_mail");
    expect(object.title).toBe("Hello");
  });

  it("normalizes calendar events", () => {
    const [object] = normalizeAppleCalendarEventsToWorkObjects([
      { id: "c1", title: "1:1", calendarName: "Work", startAt: "2026-05-18T10:00:00" },
    ]);
    expect(object.kind).toBe("calendar_event");
    expect(object.source).toBe("apple_calendar");
  });

  it("normalizes notes", () => {
    const [object] = normalizeAppleNotesToWorkObjects([
      { id: "n1", title: "Adaptive Surface", folder: "Notes", preview: "Objective frames" },
    ]);
    expect(object.kind).toBe("note");
    expect(object.source).toBe("apple_notes");
  });

  it("normalizes reminders", () => {
    const [object] = normalizeAppleRemindersToWorkObjects([{ id: "r1", title: "Follow up", dueAt: "tomorrow" }]);
    expect(object.kind).toBe("reminder");
  });

  it("normalizes trusted local files and directories", () => {
    const objects = normalizeFileDirectoryToWorkObjects({
      trustedRoots: ["/Users/pavlosamoshko/Documents"],
      personalIndexPath: "/tmp/index.md",
      indexFound: false,
      totalFiles: 1,
      totalDirectories: 1,
      scannedEntries: 2,
      topExtensions: [{ extension: "pdf", count: 1 }],
      recentFiles: [{ path: "/Users/pavlosamoshko/Documents/latest.pdf", modifiedAtMs: 1 }],
      indexPreview: [],
    });
    expect(objects.some((object) => object.kind === "directory")).toBe(true);
    expect(objects.some((object) => object.kind === "document")).toBe(true);
  });
});
