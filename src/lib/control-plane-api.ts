import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type { ControlPlaneDemoInput, ControlPlaneRunResult } from "@/types/control-plane";

export async function runControlPlaneDemo(input: ControlPlaneDemoInput = {}): Promise<ControlPlaneRunResult> {
  ensureTauri("The backend control plane is available only inside the Tauri desktop runtime.");
  return invoke<ControlPlaneRunResult>("run_control_plane_demo", { input });
}

function ensureTauri(message: string) {
  if (!isTauriRuntime()) {
    throw new Error(message);
  }
}
