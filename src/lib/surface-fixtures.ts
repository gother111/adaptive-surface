import type { SurfaceConfig, SurfaceMeta } from "@/types/surface";
import {
  BadgeCheck,
  BrainCircuit,
  ClipboardCheck,
  FileText,
  Network,
} from "lucide-react";

export const surfaceMetas: SurfaceMeta[] = [
  {
    id: "brief",
    kind: "brief",
    title: "Brief",
    description: "A living executive summary that streams in updates.",
    icon: FileText,
  },
  {
    id: "canvas",
    kind: "canvas",
    title: "Canvas",
    description: "A freeform tldraw work surface for diagrams and notes.",
    icon: Network,
  },
  {
    id: "decision",
    kind: "decision",
    title: "Decision View",
    description: "Options, tradeoffs, confidence, and next best action.",
    icon: BrainCircuit,
  },
  {
    id: "approval",
    kind: "approval",
    title: "Approval Card",
    description: "Explicit human approval before external actions.",
    icon: ClipboardCheck,
  },
  {
    id: "settings",
    kind: "settings",
    title: "Settings",
    description: "Models, voice, permissions, and integrations.",
    icon: BadgeCheck,
  },
];

export const initialSurfaces: SurfaceConfig[] = [
  {
    id: "brief",
    kind: "brief",
    title: "Morning Operating Brief",
    subtitle: "Streaming context from calendar, docs, and local task state.",
    streamStatus: "streaming",
    briefBlocks: [
      {
        id: "focus",
        title: "Primary focus",
        body: "Prepare the investor follow-up package and turn scattered notes into one action-ready surface.",
        status: "fresh",
      },
      {
        id: "signal",
        title: "New signal",
        body: "Two conversations mention uncertainty around approvals. Recommend opening an Approval Card before sending anything externally.",
        status: "watching",
      },
      {
        id: "blocked",
        title: "Blocked item",
        body: "Accessibility permissions are required before AppleScript automations can touch other apps.",
        status: "blocked",
      },
    ],
  },
  {
    id: "canvas",
    kind: "canvas",
    title: "Adaptive Work Canvas",
    subtitle: "Sketch intent, map work objects, and let the agent stream useful structure into place.",
    streamStatus: "idle",
  },
  {
    id: "decision",
    kind: "decision",
    title: "Decision View",
    subtitle: "A controlled surface for choosing a path before the app takes action.",
    streamStatus: "complete",
    decisionOptions: [
      {
        id: "read-only",
        label: "Start read-only",
        confidence: 91,
        tradeoff: "Safer for early integrations, slower to demonstrate end-to-end autonomy.",
      },
      {
        id: "approval",
        label: "Add approval-gated writes",
        confidence: 78,
        tradeoff: "Shows the real product promise while keeping external side effects explicit.",
      },
      {
        id: "autonomous",
        label: "Autonomous actions now",
        confidence: 31,
        tradeoff: "Flashier demo, but risky before permissions, audit trails, and undo paths exist.",
      },
    ],
  },
  {
    id: "approval",
    kind: "approval",
    title: "Approval Required",
    subtitle: "Review exact actions before AppleScript, email, calendar, or integration writes run.",
    streamStatus: "thinking",
    approvalActions: [
      {
        id: "draft",
        label: "Create draft follow-up",
        target: "Mail draft only, no send",
        risk: "low",
      },
      {
        id: "calendar",
        label: "Open scheduling slots",
        target: "Calendar availability read",
        risk: "medium",
      },
      {
        id: "osascript",
        label: "Run AppleScript",
        target: "System Events placeholder",
        risk: "high",
      },
    ],
  },
  {
    id: "settings",
    kind: "settings",
    title: "Settings",
    subtitle: "Prepare local model routing, voice capture, permissions, and integrations.",
    streamStatus: "idle",
  },
];
