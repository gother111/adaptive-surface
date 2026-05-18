import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("foundation adapters do not open Apple apps for read/list/search", () => {
  it("keeps launch_application out of Apple read adapters and diagnostics", () => {
    const files = [
      "src-tauri/src/apple/mail.rs",
      "src-tauri/src/apple/calendar.rs",
      "src-tauri/src/apple/reminders.rs",
      "src-tauri/src/apple/contacts.rs",
      "src-tauri/src/apple/notes.rs",
      "src-tauri/src/apple/permissions.rs",
    ];

    for (const file of files) {
      const source = readFileSync(`${root}/${file}`, "utf8");
      expect(source).not.toContain("launch_application");
      expect(source).not.toContain("Command::new(\"open\")");
      expect(source).not.toContain("tell application \"Calendar\"\n\tlaunch");
    }
  });
});
