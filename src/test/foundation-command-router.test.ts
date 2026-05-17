import { describe, expect, it } from "vitest";
import { routeFoundationCommand } from "@/local-context/work-command-router";

describe("foundation command router", () => {
  it("routes capability status before the intent analyzer", () => {
    const command = routeFoundationCommand("Show capability status");
    expect(command?.kind).toBe("show_capability_status");
    expect(command?.adapter).toBe("load_capability_diagnostics");
  });

  it("routes read commands to real local adapters", () => {
    expect(routeFoundationCommand("Show recent emails")?.adapter).toBe("load_mail_messages");
    expect(routeFoundationCommand("Open the latest email fully")?.adapter).toBe("read_mail_message");
    expect(routeFoundationCommand("Show today's calendar")?.adapter).toBe("load_calendar_events");
    expect(routeFoundationCommand("Show my reminders")?.adapter).toBe("load_reminders");
    expect(routeFoundationCommand("Show recent notes")?.adapter).toBe("load_notes");
    expect(routeFoundationCommand("Open the full latest note")?.adapter).toBe("read_note");
    expect(routeFoundationCommand("Find contacts named Yurii")?.adapter).toBe("search_contacts");
  });

  it("routes local file commands with trusted root filters", () => {
    const showDesktop = routeFoundationCommand("Show files from Desktop");
    expect(showDesktop?.kind).toBe("show_files");
    expect(showDesktop?.payload.root).toBe("Desktop");

    const searchPdf = routeFoundationCommand("Search my Documents for PDF files");
    expect(searchPdf?.kind).toBe("search_files");
    expect(searchPdf?.payload.root).toBe("Documents");
    expect(searchPdf?.payload.extension).toBe("pdf");
  });

  it("marks write commands as approval-required", () => {
    expect(routeFoundationCommand("Create a calendar event tomorrow at 10 called Test Event")?.requiresApproval).toBe(true);
    expect(routeFoundationCommand("Create a reminder to test Seemless tomorrow morning")?.requiresApproval).toBe(true);
    expect(routeFoundationCommand("Create a note called Seemless Test Note")?.requiresApproval).toBe(true);
  });
});
