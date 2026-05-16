import type { SurfaceBlueprint, SurfaceNode } from "@/surface-engine/blueprint";

export interface EmailDraftInput {
  transcript?: string;
  recipient?: string;
  body?: string;
}

export function createEmailDraftBlueprint(input: EmailDraftInput = {}): SurfaceBlueprint {
  const now = Date.now();

  return {
    id: "voice-email-draft-blueprint",
    kind: "email_draft",
    title: "Email Draft",
    subtitle: "Voice-first email canvas",
    mode: "streaming",
    layout: { type: "spatial_canvas", width: 1280, height: 820 },
    context: {
      transcript: input.transcript,
      intent: "email_draft",
      confidence: 0.96,
      metadata: {
        selectedNodeId: "email-body",
        focusedNodeId: "email-body",
      },
    },
    components: [
      emailDraftSurface(input),
    ],
    actions: [{ id: "refine-email", label: "Refine email", intent: "refine", visualOnly: true }],
    createdAt: now,
    updatedAt: now,
  };
}

export function createCalendarContextNode(): SurfaceNode<"calendar_context"> {
  return {
    id: "calendar_context",
    type: "calendar_context",
    name: "Calendar context",
    role: "supporting_context",
    tags: ["calendar", "availability", "context"],
    semanticText: "mock calendar availability context",
    geometry: { x: 720, y: 128, width: 360, height: 330, minWidth: 280, minHeight: 220, zIndex: 8 },
    visibility: { state: "visible" },
    interaction: { selectable: true, focusable: true, draggable: true, resizable: true },
    bindings: [
      {
        id: "mock-calendar-availability",
        source: "apple_calendar",
        label: "Calendar availability",
        status: "planned",
        refreshPolicy: "manual",
        preview: "Mock context only. No calendar read has happened.",
      },
    ],
    props: {
      title: "Calendar context",
      status: "mock",
      items: [
        { id: "fri-morning", label: "Friday morning", detail: "Tentatively busy" },
        { id: "fri-after-2", label: "Friday after 2 PM", detail: "Available window to mention" },
      ],
    },
    priority: "high",
  };
}

function emailDraftSurface(input: EmailDraftInput): SurfaceNode<"email_draft_surface"> {
  return {
    id: "email-draft-surface",
    type: "email_draft_surface",
    name: "Email draft",
    role: "primary_work_object",
    tags: ["email", "draft", "message"],
    semanticText: "email draft message composer",
    geometry: { x: 120, y: 104, width: 560, height: 560, minWidth: 420, minHeight: 420, zIndex: 10 },
    visibility: { state: "visible" },
    interaction: { selectable: true, focusable: true, draggable: true, resizable: true, editable: true },
    props: { to: input.recipient, subject: "Available Friday", tone: "warm" },
    children: [emailBody(input.body)],
    priority: "critical",
  };
}

function emailBody(body?: string): SurfaceNode<"email_body"> {
  return {
    id: "email_body",
    type: "email_body",
    name: "Email body",
    role: "primary_work_object",
    tags: ["email", "body", "draft"],
    semanticText: "email body draft text",
    visibility: { state: "visible" },
    interaction: { selectable: true, focusable: true, editable: true },
    props: {
      body: body ?? "Hi,\n\nI’m drafting this now. Tell me who it should go to and what it should say.\n\nBest,",
      placeholder: "Start speaking and the email will form here.",
    },
    priority: "critical",
  };
}
