import type { SurfaceInstance, WorkspacePatch, WorkspaceSession } from "@/workspace/types";

export function createInitialWorkspaceSession(): WorkspaceSession {
  return {
    id: "workspace-session-local",
    active: false,
    primarySurfaceId: null,
    surfaces: [],
    currentGoal: null,
    mode: "idle",
    transcriptHistory: [],
    recentContext: {},
    debugVisible: false,
  };
}

export function applyWorkspacePatch(session: WorkspaceSession, patch: WorkspacePatch): WorkspaceSession {
  const updatedAt = Date.now();

  switch (patch.type) {
    case "CREATE_SURFACE": {
      const surfaces = upsertSurface(session.surfaces, patch.surface);
      const nextPrimarySurfaceId =
        patch.surface.role === "primary" && !session.primarySurfaceId
          ? patch.surface.id
          : session.primarySurfaceId;

      return {
        ...session,
        active: true,
        primarySurfaceId: nextPrimarySurfaceId,
        surfaces,
        currentGoal: patch.surface.role === "primary" ? surfaceGoal(patch.surface) : session.currentGoal,
        mode: patch.surface.kind === "email_draft" ? "drafting" : session.mode,
      };
    }
    case "UPSERT_SURFACE": {
      const surfaces = upsertSurface(session.surfaces, patch.surface);
      return {
        ...session,
        active: true,
        surfaces,
        primarySurfaceId: patch.surface.role === "primary" ? patch.surface.id : session.primarySurfaceId,
        currentGoal: patch.surface.role === "primary" ? surfaceGoal(patch.surface) : session.currentGoal,
      };
    }
    case "UPDATE_SURFACE":
      return {
        ...session,
        surfaces: session.surfaces.map((surface) =>
          surface.id === patch.surfaceId
            ? {
                ...surface,
                role: patch.role ?? surface.role,
                zone: patch.zone ?? surface.zone,
                status: surface.status === "hidden" ? "active" : surface.status,
                updatedAt,
                props: { ...surface.props, ...patch.props },
              }
            : surface,
        ),
      };
    case "COLLAPSE_SURFACE":
      return {
        ...session,
        surfaces: session.surfaces.map((surface) =>
          surface.id === patch.surfaceId
            ? { ...surface, status: "collapsed", updatedAt }
            : surface,
        ),
      };
    case "REMOVE_SURFACE": {
      const surfaces = session.surfaces.filter((surface) => surface.id !== patch.surfaceId);
      const removedPrimary = session.primarySurfaceId === patch.surfaceId;
      return {
        ...session,
        active: surfaces.length > 0,
        primarySurfaceId: removedPrimary ? null : session.primarySurfaceId,
        surfaces,
        mode: surfaces.length > 0 ? session.mode : "idle",
        currentGoal: removedPrimary ? null : session.currentGoal,
      };
    }
    case "SET_PRIMARY_SURFACE":
      if (!session.surfaces.some((surface) => surface.id === patch.surfaceId)) {
        return session;
      }

      return {
        ...session,
        active: true,
        primarySurfaceId: patch.surfaceId,
        surfaces: session.surfaces.map((surface) =>
          surface.id === patch.surfaceId
            ? { ...surface, role: "primary", zone: "main", status: "active", updatedAt }
            : surface,
        ),
      };
    case "SET_DEBUG_VISIBLE":
      return { ...session, debugVisible: patch.visible };
    case "APPEND_UTTERANCE":
      return {
        ...session,
        transcriptHistory: [patch.utterance, ...session.transcriptHistory].slice(0, 40),
      };
    case "STORE_CONTEXT_RESULT":
      return {
        ...session,
        recentContext: { ...session.recentContext, [patch.key]: patch.value },
      };
  }
}

export function applyWorkspacePatches(session: WorkspaceSession, patches: WorkspacePatch[]): WorkspaceSession {
  return patches.reduce((current, patch) => applyWorkspacePatch(current, patch), session);
}

function upsertSurface(surfaces: SurfaceInstance[], surface: SurfaceInstance) {
  const existing = surfaces.find((item) => item.id === surface.id);

  if (!existing) {
    return [...surfaces, surface];
  }

  return surfaces.map((item) =>
    item.id === surface.id
      ? {
          ...item,
          ...surface,
          props: { ...item.props, ...surface.props },
          status: "active" as const,
          updatedAt: surface.updatedAt,
        }
      : item,
  );
}

function surfaceGoal(surface: SurfaceInstance) {
  if (surface.kind === "email_draft") {
    return "Draft an email";
  }

  return surface.kind.replace(/_/g, " ");
}
