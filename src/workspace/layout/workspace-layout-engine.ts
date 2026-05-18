import type { SurfaceInstance, SurfaceRole, SurfaceZone } from "@/workspace/types";

export interface LayoutAssignment {
  role: SurfaceRole;
  zone: SurfaceZone;
}

const LIST_KINDS = new Set<SurfaceInstance["kind"]>(["email_list", "notes_list", "reminder_list", "files", "contacts"]);
const DETAIL_KINDS = new Set<SurfaceInstance["kind"]>(["email_detail", "note_detail", "file_detail", "calendar_day", "unsupported_context"]);
const ERROR_KINDS = new Set<SurfaceInstance["kind"]>(["command_error", "capability_status"]);
const DOCK_KINDS = new Set<SurfaceInstance["kind"]>(["approval"]);

export function assignWorkspaceLayout(surface: Pick<SurfaceInstance, "kind">, options: { makePrimary?: boolean } = {}): LayoutAssignment {
  if (DOCK_KINDS.has(surface.kind)) {
    return { role: "temporary", zone: "bottomDock" };
  }

  if (ERROR_KINDS.has(surface.kind)) {
    return { role: "supporting", zone: "rightRail" };
  }

  if (options.makePrimary || DETAIL_KINDS.has(surface.kind)) {
    return { role: "primary", zone: "main" };
  }

  if (LIST_KINDS.has(surface.kind)) {
    return { role: "supporting", zone: "leftRail" };
  }

  return { role: "supporting", zone: "rightRail" };
}

export function shouldCommandBecomePrimary(kind: SurfaceInstance["kind"]) {
  return !ERROR_KINDS.has(kind) && !DOCK_KINDS.has(kind);
}
