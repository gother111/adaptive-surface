import type {
  CalendarPanelProps,
  ChartFrameProps,
  EmailDraftSurfaceProps,
  MailPanelProps,
  NotesPanelProps,
  RemindersPanelProps,
  FilesPanelProps,
  RoutedVoiceAction,
  SurfaceInstance,
  SurfaceKind,
  TableFrameProps,
  WorkspacePatch,
  WorkspaceSession,
} from "@/workspace/types";
import { isExplicitPrimaryContextSwitch, requestedSupportSurfaceKinds } from "@/local-context/context-routing-contract";

const EMAIL_SURFACE_ID = "workspace-email-draft";
const SUPPORTING_SURFACE_IDS: Partial<Record<SurfaceKind, string>> = {
  calendar: "workspace-calendar",
  mail: "workspace-mail",
  notes: "workspace-notes",
  reminders: "workspace-reminders",
  files: "workspace-files",
  table: "workspace-table",
  chart: "workspace-chart",
};

export function routeVoiceAction(session: WorkspaceSession, utterance: string): RoutedVoiceAction {
  const text = normalize(utterance);
  const primary = getPrimarySurface(session);

  if (/\b(show|open|turn on)\s+(the\s+)?debug\b/.test(text)) {
    return { kind: "debug", instruction: "show_debug" };
  }

  if (/\b(hide|close|turn off)\s+(the\s+)?debug\b/.test(text)) {
    return { kind: "debug", instruction: "hide_debug" };
  }

  const closeTarget = getCloseTarget(session, text);
  if (closeTarget) {
    return { kind: "update_existing_surface", targetSurfaceId: closeTarget.id, instruction: "collapse" };
  }

  if (isSupportingRequest(text, "chart")) {
    return { kind: "add_supporting_surface", surfaceKind: "chart", instruction: utterance };
  }

  if (isSupportingRequest(text, "table")) {
    return { kind: "add_supporting_surface", surfaceKind: "table", instruction: utterance };
  }

  if (isCreateEmailDraft(text) && (!primary || primary.kind !== "email_draft")) {
    return { kind: "create_new_primary_surface", surfaceKind: "email_draft", instruction: utterance };
  }

  const emailDraft = findSurfaceByKind(session, "email_draft");
  if (emailDraft && /\b(go back to|return to).*\b(email|draft|reply)\b/.test(text)) {
    return { kind: "focus_existing_surface", targetSurfaceId: emailDraft.id, instruction: utterance };
  }

  const documentSurface = findSurfaceByKind(session, "document");
  if (documentSurface && /\b(go back to|return to|show).*\b(briefing|brief|payment|bill|invoice|meeting prep|document|artifact)\b/.test(text)) {
    return { kind: "focus_existing_surface", targetSurfaceId: documentSurface.id, instruction: utterance };
  }

  const supportKinds = requestedSupportSurfaceKinds(text);
  if (primary?.kind === "email_draft" && supportKinds.length && beginsWithSupportLookup(text) && !isExplicitPrimaryContextSwitch(text)) {
    return supportKinds.length === 1
      ? { kind: "add_supporting_surface", surfaceKind: supportKinds[0], instruction: utterance }
      : { kind: "add_multiple_supporting_surfaces", surfaceKinds: supportKinds, instruction: utterance };
  }

  if (primary?.kind === "email_draft" && isEmailDraftFollowup(text)) {
    if (isCompletion(text)) {
      return { kind: "complete_task", targetSurfaceId: primary.id, action: completionAction(text) };
    }

    if (isTransformation(text)) {
      return {
        kind: "transform_existing_content",
        targetSurfaceId: primary.id,
        transformation: utterance,
      };
    }

    return {
      kind: "continue_current_surface",
      targetSurfaceId: primary.id,
      instruction: utterance,
    };
  }

  if (isCreateEmailDraft(text)) {
    return { kind: "create_new_primary_surface", surfaceKind: "email_draft", instruction: utterance };
  }

  if (session.primarySurfaceId && supportKinds.length && !isExplicitPrimaryContextSwitch(text)) {
    return supportKinds.length === 1
      ? { kind: "add_supporting_surface", surfaceKind: supportKinds[0], instruction: utterance }
      : { kind: "add_multiple_supporting_surfaces", surfaceKinds: supportKinds, instruction: utterance };
  }

  if (emailDraft && /\bkeep.*\b(email|draft|reply)\b/.test(text)) {
    return { kind: "focus_existing_surface", targetSurfaceId: emailDraft.id, instruction: utterance };
  }

  return { kind: "unknown", instruction: utterance };
}

export function routedActionToPatches(
  session: WorkspaceSession,
  action: RoutedVoiceAction,
  utteranceText: string,
): WorkspacePatch[] {
  const now = Date.now();
  const patches: WorkspacePatch[] = [
    {
      type: "APPEND_UTTERANCE",
      utterance: { id: crypto.randomUUID(), text: utteranceText, createdAt: now },
    },
  ];

  switch (action.kind) {
    case "create_new_primary_surface": {
      if (action.surfaceKind !== "email_draft") {
        const surface = createWorkspaceSurface(action.surfaceKind, now, "primary");
        if (!surface) {
          return patches;
        }

        return [
          ...patches,
          { type: "CREATE_SURFACE", surface },
          { type: "SET_PRIMARY_SURFACE", surfaceId: surface.id },
          { type: "STORE_CONTEXT_RESULT", key: action.surfaceKind, value: surface.props },
        ];
      }

      if (action.surfaceKind !== "email_draft") {
        return patches;
      }

      const surface = createEmailSurface(now, createEmailProps(action.instruction));
      return [
        ...patches,
        { type: "CREATE_SURFACE", surface },
        { type: "SET_PRIMARY_SURFACE", surfaceId: surface.id },
      ];
    }
    case "continue_current_surface":
    case "update_existing_surface": {
      if (action.instruction === "collapse") {
        return [...patches, { type: "COLLAPSE_SURFACE", surfaceId: action.targetSurfaceId }];
      }

      const surface = session.surfaces.find((item) => item.id === action.targetSurfaceId);
      if (surface?.kind !== "email_draft") {
        return patches;
      }

      return [
        ...patches,
        {
          type: "UPDATE_SURFACE",
          surfaceId: action.targetSurfaceId,
          props: { ...updateEmailProps(surface.props, action.instruction) },
        },
      ];
    }
    case "focus_existing_surface":
      return [
        ...patches,
        { type: "SET_PRIMARY_SURFACE", surfaceId: action.targetSurfaceId },
      ];
    case "transform_existing_content": {
      const surface = session.surfaces.find((item) => item.id === action.targetSurfaceId);
      if (surface?.kind !== "email_draft") {
        return patches;
      }

      return [
        ...patches,
        {
          type: "UPDATE_SURFACE",
          surfaceId: action.targetSurfaceId,
          props: { ...transformEmailProps(surface.props, action.transformation) },
        },
      ];
    }
    case "add_supporting_surface": {
      const surface = createWorkspaceSurface(action.surfaceKind, now, session.primarySurfaceId ? "supporting" : "primary");
      if (!surface) {
        return patches;
      }

      return [
        ...patches,
        { type: "CREATE_SURFACE", surface },
        { type: "STORE_CONTEXT_RESULT", key: action.surfaceKind, value: surface.props },
      ];
    }
    case "add_multiple_supporting_surfaces": {
      const surfaces = action.surfaceKinds
        .map((surfaceKind, index) =>
          createWorkspaceSurface(surfaceKind, now, !session.primarySurfaceId && index === 0 ? "primary" : "supporting"),
        )
        .filter((surface): surface is SurfaceInstance => surface !== null);

      return surfaces.reduce(
        (nextPatches, surface) => [
          ...nextPatches,
          { type: "CREATE_SURFACE" as const, surface },
          { type: "STORE_CONTEXT_RESULT" as const, key: surface.kind, value: surface.props },
        ],
        patches,
      );
    }
    case "complete_task":
      return [
        ...patches,
        {
          type: "UPDATE_SURFACE",
          surfaceId: action.targetSurfaceId,
          props: { statusLabel: `${action.action} ready for approval` },
        },
      ];
    case "debug":
      return [
        ...patches,
        { type: "SET_DEBUG_VISIBLE", visible: action.instruction !== "hide_debug" },
      ];
    case "unknown":
      return patches;
  }
}

function createEmailSurface(now: number, props: EmailDraftSurfaceProps): SurfaceInstance {
  return {
    id: EMAIL_SURFACE_ID,
    kind: "email_draft",
    role: "primary",
    zone: "main",
    status: "active",
    createdAt: now,
    updatedAt: now,
    props: { ...props },
  };
}

function createWorkspaceSurface(
  kind: SurfaceKind,
  now: number,
  role: "primary" | "supporting",
): SurfaceInstance | null {
  const id = SUPPORTING_SURFACE_IDS[kind];

  if (!id) {
    return null;
  }

  return {
    id,
    kind,
    role,
    zone: role === "primary" ? "main" : preferredZone(kind),
    status: "active",
    createdAt: now,
    updatedAt: now,
    props: { ...supportingProps(kind) },
  };
}

function createEmailProps(instruction: string): EmailDraftSurfaceProps {
  return updateEmailProps(
    {
      to: extractRecipient(instruction) ?? "",
      subject: "Friday availability",
      body: "Hi,\n\nTell me what this email should say.\n\nBest,",
      tone: "warm",
      sourceChips: [],
    },
    instruction,
  );
}

function updateEmailProps(current: Record<string, unknown>, instruction: string): EmailDraftSurfaceProps {
  const existing = readEmailProps(current);
  const recipient = extractRecipient(instruction) ?? existing.to;
  const sentence = sentenceFromInstruction(instruction);
  const body = buildBody(existing.body, sentence, recipient);
  const sourceChips = new Set(existing.sourceChips);

  if (mentionsCalendar(instruction)) {
    sourceChips.add("Calendar");
  }

  if (mentionsNotes(instruction)) {
    sourceChips.add("Notes");
  }

  return {
    to: recipient,
    subject: subjectFromInstruction(instruction, existing.subject),
    body,
    tone: existing.tone,
    sourceChips: Array.from(sourceChips),
  };
}

function transformEmailProps(current: Record<string, unknown>, transformation: string): Partial<EmailDraftSurfaceProps> {
  const existing = readEmailProps(current);
  const text = normalize(transformation);

  if (/\b(professional|formal)\b/.test(text)) {
    return {
      tone: "formal",
      subject: existing.subject || "Friday availability",
      body: existing.body.replace("Hi,", "Hello,"),
    };
  }

  if (/\b(warmer|friendly|softer)\b/.test(text)) {
    const body = existing.body.includes("I hope you are doing well.")
      ? existing.body
      : existing.body.replace(/\n\n/, "\n\nI hope you are doing well.\n\n");

    return { tone: "warm", body };
  }

  return updateEmailProps(current, transformation);
}

function readEmailProps(props: Record<string, unknown>): EmailDraftSurfaceProps {
  return {
    to: typeof props.to === "string" ? props.to : "",
    subject: typeof props.subject === "string" ? props.subject : "Friday availability",
    body: typeof props.body === "string" ? props.body : "Hi,\n\nTell me what this email should say.\n\nBest,",
    tone: props.tone === "formal" || props.tone === "direct" || props.tone === "warm" ? props.tone : "warm",
    sourceChips: Array.isArray(props.sourceChips)
      ? props.sourceChips.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function buildBody(currentBody: string, sentence: string | null, recipient: string) {
  if (!sentence) {
    return currentBody;
  }

  const greeting = recipient ? `Hi ${recipient},` : "Hi,";
  const usableCurrent = currentBody.includes("Tell me what this email should say.") ? "" : currentBody;
  const withoutSignoff = usableCurrent
    .replace(/^Hi(?: [A-Za-z]+)?,\n\n/, "")
    .replace(/\n\nBest,$/, "")
    .trim();
  const nextBody = [withoutSignoff, sentence].filter(Boolean).join("\n\n");

  return `${greeting}\n\n${nextBody}\n\nBest,`;
}

function sentenceFromInstruction(instruction: string) {
  const text = normalize(instruction);

  if (/\b(write|draft|compose|start).*\b(email|mail|message)\b/.test(text) && !/\b(that|saying|say|tell|mention|include|about)\b/.test(text)) {
    return null;
  }

  if (/\b(after 3|after three)\b/.test(text)) {
    return "I am available after 3.";
  }

  if (/\b(free|available).*\bfriday\b/.test(text) || /\bfriday\b.*\b(free|available)\b/.test(text)) {
    return /\bafter\b/.test(text) ? "I am available on Friday after 3." : "I am free on Friday.";
  }

  const cleaned = instruction
    .replace(/\b(write|draft|compose|email|mail|message|to|for|that|tell|include|add|say|mention|also|insert|this|into|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${capitalize(cleaned)}.` : null;
}

function subjectFromInstruction(instruction: string, current: string) {
  const text = normalize(instruction);
  if (/\bfriday|available|availability|free\b/.test(text)) {
    return "Friday availability";
  }

  return current || "Follow-up";
}

function supportingProps(
  kind: SurfaceKind,
): CalendarPanelProps | MailPanelProps | NotesPanelProps | RemindersPanelProps | FilesPanelProps | TableFrameProps | ChartFrameProps {
  if (kind === "calendar") {
    return {
      title: "Calendar",
      status: "loading",
      items: [],
    };
  }

  if (kind === "mail") {
    return {
      title: "Inbox",
      status: "loading",
      messages: [],
    };
  }

  if (kind === "notes") {
    return {
      title: "Recent notes",
      status: "loading",
      notes: [],
    };
  }

  if (kind === "reminders") {
    return {
      title: "Reminder draft",
      status: "needs_approval",
      reminders: [
        {
          id: "draft-reminder",
          title: "Follow up with Jacob",
          detail: "Preview only. Real creation requires approval.",
          dueAt: "tomorrow 10:00",
        },
      ],
      warnings: ["Reminders creation is approval-gated and the real adapter is not implemented yet."],
    };
  }

  if (kind === "files" || kind === "document") {
    return {
      title: "Trusted files",
      status: "empty",
      files: [],
      warnings: ["File search reads only trusted local roots."],
    };
  }

  if (kind === "table") {
    return {
      title: "Sample table",
      columns: ["Item", "Signal", "Use"],
      rows: [
        { Item: "Calendar", Signal: "Friday after 3 PM", Use: "Availability" },
        { Item: "Notes", Signal: "Warm tone", Use: "Email style" },
      ],
    };
  }

  return {
    title: "Sample chart",
    series: [
      { label: "Mon", value: 34 },
      { label: "Tue", value: 52 },
      { label: "Wed", value: 43 },
      { label: "Thu", value: 65 },
      { label: "Fri", value: 82 },
    ],
  };
}

function preferredZone(kind: SurfaceKind) {
  if (kind === "calendar") return "top_left";
  if (kind === "mail") return "top_left";
  if (kind === "notes" || kind === "table") return "bottom_left";
  if (kind === "reminders" || kind === "files" || kind === "document") return "bottom_left";
  if (kind === "chart") return "top_left";
  return "left";
}

function getPrimarySurface(session: WorkspaceSession) {
  return session.surfaces.find((surface) => surface.id === session.primarySurfaceId) ?? null;
}

function getCloseTarget(session: WorkspaceSession, text: string) {
  if (!/\b(close|hide|collapse|dismiss|remove)\b/.test(text)) {
    return null;
  }

  if (/\bcalendar\b/.test(text)) return findSurfaceByKind(session, "calendar");
  if (/\b(mail|email|inbox|messages)\b/.test(text)) return findSurfaceByKind(session, "mail");
  if (/\bnotes?\b/.test(text)) return findSurfaceByKind(session, "notes");
  if (/\breminders?\b/.test(text)) return findSurfaceByKind(session, "reminders");
  if (/\b(files?|folder|pdf|document)\b/.test(text)) return findSurfaceByKind(session, "files") ?? findSurfaceByKind(session, "document");
  if (/\b(chart|graph)\b/.test(text)) return findSurfaceByKind(session, "chart");
  if (/\b(table|spreadsheet)\b/.test(text)) return findSurfaceByKind(session, "table");
  if (/\bemail|draft|message\b/.test(text)) return getPrimarySurface(session);

  return null;
}

function findSurfaceByKind(session: WorkspaceSession, kind: SurfaceKind) {
  return session.surfaces.find((surface) => surface.kind === kind && surface.status !== "hidden") ?? null;
}

function isCreateEmailDraft(text: string) {
  return /\b(draft|write|compose|start).*\b(email|mail|message)\b/.test(text) || /^draft an email\b/.test(text) || /\b(draft|write|compose).*\breply\b/.test(text);
}

function isSupportingRequest(text: string, kind: SurfaceKind) {
  if (kind === "chart") return /\b(draw|show|create|make).*\b(graph|chart)\b/.test(text);
  if (kind === "table") return /\b(show|create|make|draw|add).*\b(table|spreadsheet)\b/.test(text);
  return false;
}

function beginsWithSupportLookup(text: string) {
  return /^(check|show|use|open|pull up|bring up)\b/.test(text) || /\b(as supporting|supporting context|context only)\b/.test(text);
}

function isTransformation(text: string) {
  return /\b(make it|make this|warmer|friendlier|more professional|formal|shorter|clearer)\b/.test(text);
}

function isCompletion(text: string) {
  return /\b(send|export|save|copy)\b/.test(text) && /\b(email|draft|this|it)\b/.test(text);
}

function isEmailDraftFollowup(text: string) {
  return isCompletion(text) || isTransformation(text) || /\b(email|draft|message|write|say|tell|mention|include|make it|subject|recipient)\b/.test(text);
}

function completionAction(text: string): "send" | "export" | "save" | "copy" {
  if (/\bexport\b/.test(text)) return "export";
  if (/\bsave\b/.test(text)) return "save";
  if (/\bcopy\b/.test(text)) return "copy";
  return "send";
}

function extractRecipient(instruction: string) {
  const match = instruction.match(/\b(?:to|for)\s+([A-Z][a-z]+|[a-z]+)/);
  return match?.[1] ? titleCase(match[1]) : null;
}

function mentionsCalendar(instruction: string) {
  return /\bcalendar|availability|schedule|friday|after 3|after three\b/i.test(instruction);
}

function mentionsNotes(instruction: string) {
  return /\bnotes?|recent notes?\b/i.test(instruction);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
