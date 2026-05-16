import { createCalendarContextNode, createEmailDraftBlueprint } from "@/surface-engine/email-draft-preset";
import type { SurfaceBlueprint } from "@/surface-engine/blueprint";
import type { SurfacePatch } from "@/surface-engine/patch-types";
import type { SurfaceConfig } from "@/types/surface";

export type SurfaceSessionKind = "email_draft";

export interface SurfaceSession {
  id: string;
  kind: SurfaceSessionKind;
  surfaceId: string;
  createdAt: number;
  updatedAt: number;
}

export type SurfaceSessionPatch =
  | {
      op: "CREATE_SURFACE";
      surfaceKind: "email_draft";
      surface: SurfaceConfig;
    }
  | {
      op: "UPDATE_COMPONENT";
      targetNodeId: string;
      patch: SurfacePatch;
    }
  | {
      op: "ADD_COMPONENT";
      parentNodeId?: string;
      nodeId: string;
      patch: SurfacePatch;
    }
  | {
      op: "REMOVE_COMPONENT";
      targetNodeId: string;
      patch: SurfacePatch;
    };

export interface SurfaceSessionResult {
  session: SurfaceSession;
  patches: SurfaceSessionPatch[];
}

export function processSurfaceSessionUtterance(
  utterance: string,
  activeBlueprint?: SurfaceBlueprint,
  activeSession?: SurfaceSession | null,
): SurfaceSessionResult | null {
  const text = normalize(utterance);

  if (isCreateEmailDraft(text)) {
    const surface = createEmailSurfaceConfig(utterance, extractEmailBody(utterance));

    return {
      session: createSession(surface.id),
      patches: [{ op: "CREATE_SURFACE", surfaceKind: "email_draft", surface }],
    };
  }

  if (activeSession?.kind !== "email_draft" && activeBlueprint?.kind !== "email_draft") {
    return null;
  }

  if (/\b(check|look at|pull in|add).*\b(calendar|availability)\b/.test(text)) {
    return {
      session: updateSession(activeSession),
      patches: [
        {
          op: "ADD_COMPONENT",
          nodeId: "calendar_context",
          patch: { op: "add_component", node: createCalendarContextNode(), position: "end" },
        },
      ],
    };
  }

  if (/\b(include|add|say|write|tell)\b/.test(text)) {
    const body = buildEmailBody(utterance);
    const patches: SurfaceSessionPatch[] = [
      {
        op: "UPDATE_COMPONENT",
        targetNodeId: "email_body",
        patch: { op: "update_props", targetNodeId: "email_body", props: { body } },
      },
    ];

    if (/\b(after 2|after two|free after)\b/.test(text)) {
      patches.push({
        op: "REMOVE_COMPONENT",
        targetNodeId: "calendar_context",
        patch: {
          op: "set_node_visibility",
          targetNodeId: "calendar_context",
          visibility: { state: "collapsed", reason: "availability included in email" },
        },
      });
    }

    return {
      session: updateSession(activeSession),
      patches,
    };
  }

  return null;
}

export function sessionPatchToSurfacePatch(patch: SurfaceSessionPatch): SurfacePatch | null {
  return "patch" in patch ? patch.patch : null;
}

function createEmailSurfaceConfig(transcript: string, body?: string): SurfaceConfig {
  return {
    id: "voice-email-draft",
    kind: "email_draft",
    title: "Email Draft",
    subtitle: "A focused voice-first email canvas.",
    streamStatus: "streaming",
    liveTranscript: transcript,
    blueprint: createEmailDraftBlueprint({
      transcript,
      recipient: extractRecipient(transcript),
      body,
    }),
  };
}

function createSession(surfaceId: string): SurfaceSession {
  const now = Date.now();
  return { id: `session-${surfaceId}`, kind: "email_draft", surfaceId, createdAt: now, updatedAt: now };
}

function updateSession(session?: SurfaceSession | null): SurfaceSession {
  return session ? { ...session, updatedAt: Date.now() } : createSession("voice-email-draft");
}

function isCreateEmailDraft(text: string) {
  return /\b(draft|write|compose|start).*\b(email|mail|message)\b/.test(text) || /\bemail\b/.test(text);
}

function buildEmailBody(utterance: string) {
  const recipient = extractRecipient(utterance);
  const availability = /\b(after 2|after two|free after)\b/i.test(utterance)
    ? "I’m available Friday after 2 PM."
    : sentenceFromUtterance(utterance);

  return `Hi${recipient ? ` ${recipient}` : ""},\n\n${availability}\n\nBest,`;
}

function extractEmailBody(utterance: string) {
  if (!/\b(write|tell|that)\b/i.test(utterance)) {
    return undefined;
  }

  return buildEmailBody(utterance);
}

function extractRecipient(utterance: string) {
  const match = utterance.match(/\b(?:to|for)\s+([A-Z][a-z]+|[a-z]+)/);
  if (!match?.[1]) {
    return undefined;
  }

  return titleCase(match[1]);
}

function sentenceFromUtterance(utterance: string) {
  const cleaned = utterance
    .replace(/\b(write|draft|compose|email|mail|message|to|for|that|tell|include|add|say)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned ? `${capitalize(cleaned)}.` : "I’m available Friday.";
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
