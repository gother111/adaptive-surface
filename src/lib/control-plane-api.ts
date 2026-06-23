import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  ApprovalRequest,
  ControlPlaneSessionSnapshot,
  OperationCommand,
  SemanticCapabilityDescriptor,
  SubmitObjectiveInput,
  SubmitObjectiveResponse,
} from "@/types/control-plane";

export async function submitFinalUtterance(input: SubmitObjectiveInput): Promise<SubmitObjectiveResponse> {
  ensureTauri("The live control plane is available only inside the Tauri desktop runtime.");
  return invoke<SubmitObjectiveResponse>("submit_final_utterance", { input });
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
