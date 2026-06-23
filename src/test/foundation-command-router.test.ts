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
    expect(routeFoundationCommand("Can you pull up my recent emails")?.kind).toBe("show_recent_emails");
    expect(routeFoundationCommand("Open my inbox")?.kind).toBe("show_recent_emails");
    expect(routeFoundationCommand("Open the latest email fully")?.adapter).toBe("read_mail_message");
    expect(routeFoundationCommand("Summarize the latest email")?.kind).toBe("summarize_latest_email");
    expect(routeFoundationCommand("Analyze this email")?.adapter).toBe("analyze_mail_message");
    expect(routeFoundationCommand("Create a text document from the latest email summary")?.kind).toBe("create_email_summary_artifact");
    expect(routeFoundationCommand("Show today's calendar")?.adapter).toBe("load_calendar_events");
    expect(routeFoundationCommand("Show me my calendar")?.kind).toBe("show_today_calendar");
    expect(routeFoundationCommand("Can you pull up my calendar")?.kind).toBe("show_today_calendar");
    expect(routeFoundationCommand("Show my reminders")?.adapter).toBe("load_reminders");
    expect(routeFoundationCommand("Show me my reminders")?.kind).toBe("show_reminders");
    expect(routeFoundationCommand("Show recent notes")?.adapter).toBe("load_notes");
    expect(routeFoundationCommand("Show me my notes")?.kind).toBe("show_recent_notes");
    expect(routeFoundationCommand("Open the full latest note")?.adapter).toBe("read_note");
    expect(routeFoundationCommand("Find contacts named Yurii")?.adapter).toBe("search_contacts");
    expect(routeFoundationCommand("Find Yurii in contacts")?.payload.query).toBe("yurii");
  });

  it("routes local file commands with trusted root filters", () => {
    const showDesktop = routeFoundationCommand("Show files from Desktop");
    expect(showDesktop?.kind).toBe("show_files");
    expect(showDesktop?.payload.root).toBe("Desktop");

    const searchPdf = routeFoundationCommand("Search my Documents for PDF files");
    expect(searchPdf?.kind).toBe("search_files");
    expect(searchPdf?.payload.root).toBe("Documents");
    expect(searchPdf?.payload.extension).toBe("pdf");

    expect(routeFoundationCommand("Show my documents")?.payload.root).toBe("Documents");
    expect(routeFoundationCommand("Search downloads for PDFs")?.payload.root).toBe("Downloads");
    expect(routeFoundationCommand("Search downloads for PDFs")?.payload.extension).toBe("pdf");
  });

  it("routes short natural phrases that users actually try", () => {
    expect(routeFoundationCommand("recent emails")?.kind).toBe("show_recent_emails");
    expect(routeFoundationCommand("calendar today")?.kind).toBe("show_today_calendar");
    expect(routeFoundationCommand("reminders")?.kind).toBe("show_reminders");
    expect(routeFoundationCommand("what's due today")?.kind).toBe("show_reminders");
    expect(routeFoundationCommand("what do I need to do today")?.kind).toBe("show_reminders");
    expect(routeFoundationCommand("notes")?.kind).toBe("show_recent_notes");
    expect(routeFoundationCommand("latest note")?.kind).toBe("open_latest_note");
    expect(routeFoundationCommand("find Yurii")?.payload.query).toBe("yurii");
    expect(routeFoundationCommand("desktop files")?.payload.root).toBe("Desktop");
    expect(routeFoundationCommand("documents pdf")?.payload.extension).toBe("pdf");
  });

  it("routes daily briefing, payment triage, and meeting prep commands", () => {
    expect(routeFoundationCommand("give me a morning briefing")?.kind).toBe("show_daily_briefing");
    expect(routeFoundationCommand("what bills or payments need attention")?.kind).toBe("show_payment_items");
    expect(routeFoundationCommand("prep me for my next meeting")?.kind).toBe("prepare_next_meeting");
  });

  it("routes broad inbox triage work to a synthesis artifact instead of a raw email list", () => {
    expect(routeFoundationCommand("Catch me up on inbox triage.")?.kind).toBe("create_email_triage_artifact");
    expect(routeFoundationCommand("Find the key decisions, records, and open requests for inbox triage.")?.payload.mode).toBe("extract_records");
    expect(routeFoundationCommand("Organize the work and context for inbox triage.")?.payload.mode).toBe("organize_context");
    expect(routeFoundationCommand("Compare the available options for inbox triage.")?.payload.mode).toBe("compare_options");
    expect(routeFoundationCommand("Plan the next steps for inbox triage.")?.payload.mode).toBe("plan_next_steps");
    const draftArtifact = routeFoundationCommand("Draft the main business artifact for inbox triage.");
    expect(draftArtifact?.kind).toBe("create_email_triage_artifact");
    expect(draftArtifact?.payload.mode).toBe("draft_artifact");
  });

  it("keeps local context phrases in the foundation path even when unsupported", () => {
    expect(routeFoundationCommand("Find recent notes about Adaptive Surface.")?.kind).toBe("show_recent_notes");
    expect(routeFoundationCommand("Do something with folders")?.kind).toBe("unsupported_local_context");
  });

  it("does not treat generic task words as local context commands", () => {
    expect(routeFoundationCommand("Mention yesterday's meeting in the draft")).toBeNull();
    expect(routeFoundationCommand("Make the message warmer")).toBeNull();
    expect(routeFoundationCommand("Add the event details to the brief")).toBeNull();
    expect(routeFoundationCommand("Go back to the email")).toBeNull();
    expect(routeFoundationCommand("Return to the reply draft")).toBeNull();
    expect(routeFoundationCommand("Go back to the briefing")).toBeNull();
    expect(routeFoundationCommand("Go back to the payment list")).toBeNull();
  });

  it("keeps scaffolded Google and Gmail connectors honest", () => {
    expect(routeFoundationCommand("Show Google Drive files")?.kind).toBe("show_scaffolded_connector_status");
    expect(routeFoundationCommand("Show Google Calendar")?.payload.connectorId).toBe("google.calendar");
    expect(routeFoundationCommand("Show Gmail inbox")?.payload.connectorId).toBe("gmail");
  });

  it("routes readable file follow-ups to the existing file-read runner", () => {
    expect(routeFoundationCommand("Open the latest readable file")?.kind).toBe("open_file_summary");
    expect(routeFoundationCommand("Summarize this file")?.adapter).toBe("read_local_file");
  });

  it("marks write commands as approval-required", () => {
    expect(routeFoundationCommand("Create a calendar event tomorrow at 10 called Test Event")?.requiresApproval).toBe(true);
    expect(routeFoundationCommand("Create a reminder to test Seemless tomorrow morning")?.requiresApproval).toBe(true);
    expect(routeFoundationCommand("Create a note called Seemless Test Note")?.requiresApproval).toBe(true);
  });

  it("routes cancellation before a later approval can run", () => {
    const cancel = routeFoundationCommand("cancel that");
    expect(cancel?.kind).toBe("cancel_pending_action");
    expect(cancel?.requiresApproval).toBe(false);
  });

  it("does not treat approval-inspection or conditional approval as direct approval", () => {
    expect(routeFoundationCommand("Show me what I’m being asked to approve.")?.kind).toBe("unsupported_email_action");
    expect(routeFoundationCommand("Approve it, provided legal signs off first.")?.kind).toBe("unsupported_email_action");
    expect(routeFoundationCommand("approve")?.kind).toBe("approve_pending_action");
  });

  it("routes unsupported email stories to a visible non-mutating guard", () => {
    expect(routeFoundationCommand("Summarize this thread and tell me what changed.")?.kind).toBe("unsupported_email_action");
    expect(routeFoundationCommand("Turn this into a task for Friday and link the email.")?.kind).toBe("unsupported_email_action");
    expect(routeFoundationCommand("Reply to everyone who accepted the invitation and send them the preparation notes.")?.kind).toBe("unsupported_email_action");
  });
});
