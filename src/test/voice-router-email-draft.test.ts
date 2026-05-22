import { describe, expect, it } from "vitest";
import { routeVoiceAction, routedActionToPatches } from "@/workspace/voice-router";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";

describe("workspace voice router email drafts", () => {
  it("opens a bare email draft without inventing body content", () => {
    const session = createInitialWorkspaceSession();
    const action = routeVoiceAction(session, "write an email to Jacob");
    const next = applyWorkspacePatches(session, routedActionToPatches(session, action, "write an email to Jacob"));
    const draft = next.surfaces.find((surface) => surface.kind === "email_draft");

    expect(draft?.props.to).toBe("Jacob");
    expect(String(draft?.props.body)).toContain("Tell me what this email should say.");
    expect(String(draft?.props.body)).not.toContain("An Jacob.");
  });
});
