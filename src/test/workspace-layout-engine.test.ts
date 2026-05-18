import { describe, expect, it } from "vitest";
import { assignWorkspaceLayout } from "@/workspace/layout/workspace-layout-engine";

describe("workspace layout engine", () => {
  it("places useful context across dedicated zones", () => {
    expect(assignWorkspaceLayout({ kind: "email_list" })).toEqual({ role: "supporting", zone: "leftRail" });
    expect(assignWorkspaceLayout({ kind: "calendar_day" }, { makePrimary: true })).toEqual({ role: "primary", zone: "main" });
    expect(assignWorkspaceLayout({ kind: "command_error" })).toEqual({ role: "supporting", zone: "rightRail" });
    expect(assignWorkspaceLayout({ kind: "approval" })).toEqual({ role: "temporary", zone: "bottomDock" });
  });
});
