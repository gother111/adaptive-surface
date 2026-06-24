import { describe, expect, it } from "vitest";
import {
  isExplicitPrimaryContextSwitch,
  isSupportingContextRequest,
  requestedSupportSurfaceKinds,
  shouldRunFoundationBeforeWorkspace,
} from "@/local-context/context-routing-contract";
import type { FoundationCommand } from "@/local-context/work-command-types";
import type { ObjectiveFrame } from "@/objectives/objective-types";
import { createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { WorkspaceSession } from "@/workspace/types";

function command(overrides: Partial<FoundationCommand> = {}): FoundationCommand {
  return {
    kind: "show_today_calendar",
    utterance: "check my calendar",
    surfaceKind: "calendar_day",
    adapter: "load_calendar_events",
    requiresApproval: false,
    payload: {},
    ...overrides,
  };
}

function activeObjective(overrides: Partial<ObjectiveFrame> = {}): ObjectiveFrame {
  return {
    id: "objective-draft-email",
    kind: "draft_email",
    status: "active",
    title: "Draft email",
    userGoal: "Draft an email",
    primarySurfaceId: "workspace-email-draft",
    activeObjectIds: [],
    requiredContext: [],
    plannedActions: [],
    completedActions: [],
    utterances: [],
    slots: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function sessionWithPrimarySurface(): WorkspaceSession {
  return {
    ...createInitialWorkspaceSession(),
    primarySurfaceId: "workspace-email-draft",
  };
}

describe("context routing contract", () => {
  it("runs foundation commands first when no workspace is active", () => {
    expect(
      shouldRunFoundationBeforeWorkspace("show my calendar", command(), createInitialWorkspaceSession(), null),
    ).toBe(true);
  });

  it("keeps explicit supporting context behind the active workspace", () => {
    expect(
      shouldRunFoundationBeforeWorkspace(
        "check my calendar but keep the email draft open",
        command(),
        sessionWithPrimarySurface(),
        activeObjective(),
      ),
    ).toBe(false);
  });

  it("lets explicit primary switches replace the current workspace focus", () => {
    expect(isExplicitPrimaryContextSwitch("switch to calendar instead")).toBe(true);
    expect(isExplicitPrimaryContextSwitch("check calendar but do not switch")).toBe(false);
    expect(
      shouldRunFoundationBeforeWorkspace(
        "switch to calendar instead",
        command(),
        sessionWithPrimarySurface(),
        activeObjective(),
      ),
    ).toBe(true);
  });

  it("classifies support phrases and support surface kinds without duplicates", () => {
    expect(isSupportingContextRequest("compare it with my notes and keep the draft open")).toBe(true);
    expect(requestedSupportSurfaceKinds("include calendar, notes, and calendar availability")).toEqual([
      "calendar",
      "notes",
    ]);
    expect(requestedSupportSurfaceKinds("mention this in the email draft")).toEqual([]);
  });

  it("always prioritizes approval and connector status commands", () => {
    expect(
      shouldRunFoundationBeforeWorkspace(
        "approve that",
        command({ kind: "approve_pending_action", requiresApproval: true }),
        sessionWithPrimarySurface(),
        activeObjective(),
      ),
    ).toBe(true);
    expect(
      shouldRunFoundationBeforeWorkspace(
        "show gmail inbox",
        command({ kind: "show_scaffolded_connector_status", adapter: "connector_status" }),
        sessionWithPrimarySurface(),
        activeObjective(),
      ),
    ).toBe(true);
  });
});
