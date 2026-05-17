import { describe, expect, it } from "vitest";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { SurfaceInstance, WorkspacePatch } from "@/workspace/types";

function surface(id: string, kind: SurfaceInstance["kind"], role: SurfaceInstance["role"]): SurfaceInstance {
  return {
    id,
    kind,
    role,
    zone: role === "primary" ? "main" : "bottom_left",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    props: {},
  };
}

describe("foundation workspace stability", () => {
  it("adds a foundation command surface without destroying the existing primary surface", () => {
    const initial = applyWorkspacePatches(createInitialWorkspaceSession(), [
      { type: "CREATE_SURFACE", surface: surface("workspace-email-draft", "email_draft", "primary") },
      { type: "SET_PRIMARY_SURFACE", surfaceId: "workspace-email-draft" },
    ]);
    const patches: WorkspacePatch[] = [
      { type: "CREATE_SURFACE", surface: surface("foundation-email-list", "email_list", "supporting") },
      { type: "STORE_CONTEXT_RESULT", key: "email_list", value: { status: "available" } },
    ];
    const next = applyWorkspacePatches(initial, patches);
    expect(next.primarySurfaceId).toBe("workspace-email-draft");
    expect(next.surfaces.some((item) => item.id === "foundation-email-list")).toBe(true);
  });
});
