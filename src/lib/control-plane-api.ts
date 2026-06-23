import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  ApprovalRequest,
  ControlPlaneSessionSnapshot,
  OperationCommand,
  RuntimeEventEnvelope,
  RuntimeEventsAfterInput,
  RuntimeEventsAfterResponse,
  SemanticCapabilityDescriptor,
  SubmitObjectiveInput,
  SubmitObjectiveResponse,
} from "@/types/control-plane";

let runtimeEventHandler: ((event: RuntimeEventEnvelope) => void) | null = null;
let runtimeEventListener: Promise<UnlistenFn> | null = null;

export async function submitFinalUtterance(input: SubmitObjectiveInput): Promise<SubmitObjectiveResponse> {
  ensureTauri("The live control plane is available only inside the Tauri desktop runtime.");
  return invoke<SubmitObjectiveResponse>("submit_final_utterance", { input });
}

export async function ensureControlPlaneRuntimeEventListener(
  onEvent: (event: RuntimeEventEnvelope) => void,
): Promise<void> {
  ensureTauri("Control-plane events are available only inside the Tauri desktop runtime.");
  runtimeEventHandler = onEvent;
  if (!runtimeEventListener) {
    runtimeEventListener = listen<RuntimeEventEnvelope>("control-plane://runtime-event", (event) => {
      runtimeEventHandler?.(event.payload);
    });
  }
  await runtimeEventListener;
}

export async function cancelControlPlaneOperation(command: OperationCommand): Promise<ControlPlaneSessionSnapshot> {
  ensureTauri("Control-plane cancellation is available only inside the Tauri desktop runtime.");
  return invoke<ControlPlaneSessionSnapshot>("cancel_operation", { command });
}

export async function approveControlPlaneOperation(command: OperationCommand): Promise<ControlPlaneSessionSnapshot> {
  ensureTauri("Control-plane approvals are available only inside the Tauri desktop runtime.");
  return invoke<ControlPlaneSessionSnapshot>("approve_operation", { command });
}

export async function rejectControlPlaneOperation(command: OperationCommand): Promise<ControlPlaneSessionSnapshot> {
  ensureTauri("Control-plane approvals are available only inside the Tauri desktop runtime.");
  return invoke<ControlPlaneSessionSnapshot>("reject_operation", { command });
}

export async function getControlPlaneSessionSnapshot(sessionId: string): Promise<ControlPlaneSessionSnapshot> {
  ensureTauri("Control-plane snapshots are available only inside the Tauri desktop runtime.");
  return invoke<ControlPlaneSessionSnapshot>("get_session_snapshot", { sessionId });
}

export async function getRuntimeEventsAfter(input: RuntimeEventsAfterInput): Promise<RuntimeEventsAfterResponse> {
  ensureTauri("Control-plane event catch-up is available only inside the Tauri desktop runtime.");
  return invoke<RuntimeEventsAfterResponse>("get_runtime_events_after", { input });
}

export async function listPendingControlPlaneApprovals(): Promise<ApprovalRequest[]> {
  ensureTauri("Control-plane approvals are available only inside the Tauri desktop runtime.");
  return invoke<ApprovalRequest[]>("list_pending_approvals");
}

export async function listControlPlaneCapabilities(): Promise<SemanticCapabilityDescriptor[]> {
  ensureTauri("Control-plane capabilities are available only inside the Tauri desktop runtime.");
  return invoke<SemanticCapabilityDescriptor[]>("list_control_plane_capabilities");
}

function ensureTauri(message: string) {
  if (!isTauriRuntime()) {
    throw new Error(message);
  }
}
