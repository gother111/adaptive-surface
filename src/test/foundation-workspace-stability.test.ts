import { describe, expect, it } from "vitest";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { SurfaceInstance, WorkspacePatch } from "@/workspace/types";

function surface(id: string, kind: SurfaceInstance["kind"], role: SurfaceInstance["role"], zone: SurfaceInstance["zone"] = role === "primary" ? "main" : "leftRail"): SurfaceInstance {
  return {
    id,
    kind,
    role,
    zone,
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

  it("does not collapse the previous primary when a new primary is set", () => {
    const initial = applyWorkspacePatches(createInitialWorkspaceSession(), [
      { type: "CREATE_SURFACE", surface: surface("foundation-email-list", "email_list", "primary") },
      { type: "SET_PRIMARY_SURFACE", surfaceId: "foundation-email-list" },
      { type: "CREATE_SURFACE", surface: surface("foundation-calendar-day", "calendar_day", "primary") },
      { type: "SET_PRIMARY_SURFACE", surfaceId: "foundation-calendar-day" },
    ]);

    expect(initial.primarySurfaceId).toBe("foundation-calendar-day");
    expect(initial.surfaces.find((item) => item.id === "foundation-email-list")?.status).toBe("active");
  });

  it("upserts a loading surface into a result without duplicating it", () => {
    const loading = surface("foundation-email-list", "email_list", "primary");
    loading.props = { title: "Loading local context", status: "loading" };
    const next = applyWorkspacePatches(createInitialWorkspaceSession(), [
      { type: "UPSERT_SURFACE", surface: loading },
      {
        type: "UPSERT_SURFACE",
        surface: {
          ...loading,
          updatedAt: 2,
          props: { title: "Recent emails", status: "available" },
        },
      },
    ]);

    expect(next.surfaces.filter((item) => item.id === "foundation-email-list")).toHaveLength(1);
    expect(next.surfaces[0]?.props.title).toBe("Recent emails");
  });
});
