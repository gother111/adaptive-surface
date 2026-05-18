export type SurfaceKind =
  | "email_draft"
  | "calendar"
  | "mail"
  | "notes"
  | "reminders"
  | "files"
  | "document"
  | "table"
  | "chart"
  | "intent_debug"
  | "capability_status"
  | "email_list"
  | "email_detail"
  | "calendar_day"
  | "reminder_list"
  | "notes_list"
  | "note_detail"
  | "contacts"
  | "file_detail"
  | "command_error"
  | "approval";

export type SurfaceRole = "primary" | "supporting" | "temporary" | "debug";

export type SurfaceZone =
  | "leftRail"
  | "rightRail"
  | "bottomDock"
  | "main"
  | "left"
  | "right"
  | "top_left"
  | "bottom_left"
  | "bottom"
  | "overlay";

export type SurfaceStatus = "active" | "collapsed" | "hidden";

export interface Utterance {
  id: string;
  text: string;
  createdAt: number;
}

export interface SurfaceInstance {
  id: string;
  kind: SurfaceKind;
  role: SurfaceRole;
  zone: SurfaceZone;
  status: SurfaceStatus;
  createdAt: number;
  updatedAt: number;
  props: Record<string, unknown>;
}

export interface WorkspaceSession {
  id: string;
  active: boolean;
  primarySurfaceId: string | null;
  surfaces: SurfaceInstance[];
  currentGoal: string | null;
  mode: "idle" | "drafting" | "reviewing" | "researching" | "composing";
  transcriptHistory: Utterance[];
  recentContext: Record<string, unknown>;
  debugVisible: boolean;
}

export type WorkspacePatch =
  | {
      type: "CREATE_SURFACE";
      surface: SurfaceInstance;
    }
  | {
      type: "UPDATE_SURFACE";
      surfaceId: string;
      props: Record<string, unknown>;
      role?: SurfaceRole;
      zone?: SurfaceZone;
    }
  | {
      type: "UPSERT_SURFACE";
      surface: SurfaceInstance;
    }
  | {
      type: "COLLAPSE_SURFACE";
      surfaceId: string;
    }
  | {
      type: "REMOVE_SURFACE";
      surfaceId: string;
    }
  | {
      type: "SET_PRIMARY_SURFACE";
      surfaceId: string;
    }
  | {
      type: "SET_DEBUG_VISIBLE";
      visible: boolean;
    }
  | {
      type: "APPEND_UTTERANCE";
      utterance: Utterance;
    }
  | {
      type: "STORE_CONTEXT_RESULT";
      key: string;
      value: unknown;
    };

export type RoutedVoiceAction =
  | {
      kind: "create_new_primary_surface";
      surfaceKind: SurfaceKind;
      instruction: string;
    }
  | {
      kind: "continue_current_surface";
      targetSurfaceId: string;
      instruction: string;
    }
  | {
      kind: "add_supporting_surface";
      surfaceKind: SurfaceKind;
      instruction: string;
    }
  | {
      kind: "add_multiple_supporting_surfaces";
      surfaceKinds: SurfaceKind[];
      instruction: string;
    }
  | {
      kind: "update_existing_surface";
      targetSurfaceId: string;
      instruction: string;
    }
  | {
      kind: "transform_existing_content";
      targetSurfaceId: string;
      transformation: string;
    }
  | {
      kind: "complete_task";
      targetSurfaceId: string;
      action: "send" | "export" | "save" | "copy";
    }
  | {
      kind: "debug";
      instruction: string;
    }
  | {
      kind: "unknown";
      instruction: string;
    };

export interface EmailDraftSurfaceProps {
  to: string;
  subject: string;
  body: string;
  tone: "warm" | "direct" | "formal";
  sourceChips?: string[];
}

export interface CalendarPanelProps {
  title: string;
  status: "loading" | "available" | "empty" | "warning";
  items: Array<{
    id: string;
    label: string;
    detail: string;
    calendarName?: string;
    location?: string | null;
  }>;
  warnings?: string[];
}

export interface MailPanelProps {
  title: string;
  status: "loading" | "available" | "empty" | "warning";
  messages: Array<{
    id: string;
    subject: string;
    sender: string;
    mailbox: string;
    receivedAt?: string | null;
    isRead: boolean;
    preview?: string | null;
  }>;
  warnings?: string[];
}

export interface NotesPanelProps {
  title: string;
  status: "loading" | "available" | "empty" | "warning";
  notes: Array<{
    id: string;
    title: string;
    folder: string;
    modifiedAt?: string | null;
    excerpt: string;
  }>;
  warnings?: string[];
}

export interface RemindersPanelProps {
  title: string;
  status: "draft" | "loading" | "available" | "empty" | "warning" | "needs_approval" | "not_implemented";
  reminders: Array<{
    id: string;
    title: string;
    detail?: string;
    dueAt?: string | null;
  }>;
  warnings?: string[];
}

export interface FilesPanelProps {
  title: string;
  status: "loading" | "available" | "empty" | "warning" | "not_implemented";
  files: Array<{
    id: string;
    label: string;
    path: string;
    detail?: string;
  }>;
  warnings?: string[];
}

export interface FoundationSurfaceProps {
  title: string;
  status: "loading" | "available" | "empty" | "permission_error" | "adapter_error" | "needs_approval" | "not_implemented";
  command: string;
  adapter: string;
  provider?: string;
  didOpenExternalApp?: boolean;
  errorKind?: "permission" | "unavailable" | "adapter" | "timeout" | "unsupported";
  summary?: string;
  items?: Array<Record<string, unknown>>;
  detail?: Record<string, unknown>;
  body?: string;
  error?: string | null;
  permissionHint?: string;
  suggestedNextAction?: string;
  approval?: {
    actionId: string;
    label: string;
    preview: Record<string, unknown>;
  };
}

export interface TableFrameProps {
  title: string;
  columns: string[];
  rows: Array<Record<string, string>>;
}

export interface ChartFrameProps {
  title: string;
  series: Array<{ label: string; value: number }>;
}
