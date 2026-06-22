import { describe, expect, it } from "vitest";
import { useSurfaceStore } from "@/stores/useSurfaceStore";

describe("receiveVoiceFinal local context routing", () => {
  it("routes local-context phrases through foundation command path without legacy action", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("can you pull up my recent emails");

    const state = useSurfaceStore.getState();
    expect(state.lastRoutedAction).toBeNull();
    expect(state.workspaceSession.primarySurfaceId).toBe("foundation-email_list");
    expect(state.workspaceSession.surfaces.find((surface) => surface.id === "foundation-email_list")?.kind).toBe("email_list");
  });

  it("keeps calendar requests as supporting context during an active email draft", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("workspace-email-draft");

    useSurfaceStore.getState().receiveVoiceFinal("check my calendar but keep the email draft open");
    const state = useSurfaceStore.getState();

    expect(state.lastRoutedAction?.kind).toBe("add_supporting_surface");
    expect(state.workspaceSession.primarySurfaceId).toBe("workspace-email-draft");
    expect(state.workspaceSession.surfaces.some((surface) => surface.kind === "calendar" && surface.role === "supporting")).toBe(true);
  });

  it("can explicitly switch away from and back to an email draft", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    useSurfaceStore.getState().receiveVoiceFinal("switch to calendar instead");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("foundation-calendar_day");

    useSurfaceStore.getState().receiveVoiceFinal("go back to the email");
    expect(useSurfaceStore.getState().workspaceSession.primarySurfaceId).toBe("workspace-email-draft");
  });

  it("clears workspace state when switching to a built-in surface", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Yurii saying I'll reply tomorrow");
    expect(useSurfaceStore.getState().workspaceSession.surfaces.length).toBeGreaterThan(0);

    useSurfaceStore.getState().setActiveSurface("brief");
    const state = useSurfaceStore.getState();

    expect(state.activeSurfaceId).toBe("brief");
    expect(state.workspaceSession.surfaces).toHaveLength(0);
    expect(state.workspaceSession.primarySurfaceId).toBeNull();
  });

  it("formalizes personalized email greetings", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Jacob");
    useSurfaceStore.getState().receiveVoiceFinal("also mention that I watched his talk");
    useSurfaceStore.getState().receiveVoiceFinal("make it more formal");

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.tone).toBe("formal");
    expect(draft?.props.body).toContain("Hello Jacob,");
  });

  it("keeps send commands approval-visible without sending", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Jacob");
    useSurfaceStore.getState().receiveVoiceFinal("also mention that I watched his talk");
    useSurfaceStore.getState().receiveVoiceFinal("send it");

    const state = useSurfaceStore.getState();
    const draft = state.workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(state.lastApprovalRequired).toBe(true);
    expect(draft?.props.statusLabel).toBe("Send ready for approval");
    expect(draft?.props.statusDetail).toContain("No mail has been sent");
    expect(draft?.props.safetyChecklist).toContain("Do not use Reply All, add recipients, or send externally until explicitly confirmed.");
  });

  it("answers what it is about to do from the pending email send state", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("write an email to Jacob saying the proposal works but delivery must move to September");
    useSurfaceStore.getState().receiveVoiceFinal("send it");
    useSurfaceStore.getState().receiveVoiceFinal("what are you about to do?");

    const state = useSurfaceStore.getState();
    const draft = state.workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(state.lastRoutedAction?.kind).toBe("transform_existing_content");
    expect(draft?.props.statusLabel).toBe("Send ready for approval");
    expect(draft?.props.statusDetail).toContain("Pending action: send this email after explicit approval");
    expect(draft?.props.statusDetail).toContain("Recipient: Jacob");
    expect(draft?.props.statusDetail).toContain("No mail has been sent");
  });

  it.each([
    ["copy it", "Copy ready for approval"],
    ["save it", "Save ready for approval"],
    ["export it", "Export ready for approval"],
  ])("keeps %s completion commands approval-visible", (utterance, expectedStatus) => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Jacob");
    useSurfaceStore.getState().receiveVoiceFinal("also mention that I watched his talk");
    useSurfaceStore.getState().receiveVoiceFinal(utterance);

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.statusLabel).toBe(expectedStatus);
  });

  it("clear workspace returns to the neutral ready state", () => {
    useSurfaceStore.getState().setActiveSurface("settings");
    useSurfaceStore.getState().receiveVoiceFinal("draft an email to Jacob");
    expect(useSurfaceStore.getState().workspaceSession.surfaces.length).toBeGreaterThan(0);

    useSurfaceStore.getState().receiveVoiceFinal("clear workspace");
    const state = useSurfaceStore.getState();

    expect(state.activeSurfaceId).toBe("blank");
    expect(state.workspaceSession.surfaces).toHaveLength(0);
    expect(state.workspaceSession.primarySurfaceId).toBeNull();
  });

  it("keeps warmer professional refinements warm instead of only formal", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("write an email to Jacob saying the proposal works but delivery must move to September");
    useSurfaceStore.getState().receiveVoiceFinal("make this warmer, but still professional");

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.tone).toBe("warm");
    expect(draft?.props.body).toContain("I hope you are doing well.");
    expect(draft?.props.body).toContain("delivery must move to September");
    expect(draft?.props.body).not.toContain("An Jacob saying");
  });

  it("shortens drafts without dropping the core ask", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("write an email to Jacob saying the proposal works but delivery must move to September");
    useSurfaceStore.getState().receiveVoiceFinal("shorten this to three sentences without losing the ask");

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.body).toContain("delivery must move to September");
    expect(String(draft?.props.body).split(/[.!?]/).filter((part) => part.trim()).length).toBeLessThanOrEqual(3);
  });

  it("stops a pending send status and applies a simple correction", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("write an email to Jacob saying Friday works");
    useSurfaceStore.getState().receiveVoiceFinal("send it");
    useSurfaceStore.getState().receiveVoiceFinal("Stop. Don't send that. Change Friday to Monday.");

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.statusLabel).toBe("Send canceled");
    expect(draft?.props.statusDetail).toContain("No mail has been sent");
    expect(draft?.props.body).toContain("Monday works");
    expect(draft?.props.body).not.toContain("Friday works");
  });

  it("undo cancels a pending send without sending mail", () => {
    useSurfaceStore.getState().clearWorkspace();
    useSurfaceStore.getState().receiveVoiceFinal("write an email to Jacob saying Friday works");
    useSurfaceStore.getState().receiveVoiceFinal("send it");
    useSurfaceStore.getState().receiveVoiceFinal("Undo what you just did.");

    const draft = useSurfaceStore.getState().workspaceSession.surfaces.find((surface) => surface.id === "workspace-email-draft");

    expect(draft?.props.statusLabel).toBe("Send canceled");
    expect(draft?.props.statusDetail).toContain("No mail has been sent");
    expect(draft?.props.safetyChecklist).toContain("Nothing was sent.");
  });
});
