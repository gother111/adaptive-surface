import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  AppleContextPreview,
  ExternalAuthRequirement,
  LocalContextPreview,
} from "@/types/context";

export async function loadLocalContextPreview(
  trustedRoots: string[],
  personalIndexPath: string,
): Promise<LocalContextPreview> {
  if (!isTauriRuntime()) {
    throw new Error("Local context preview is available only inside the Tauri desktop runtime.");
  }

  return invoke<LocalContextPreview>("load_local_context_preview", {
    trustedRoots,
    personalIndexPath,
  });
}

export async function loadAppleContextPreview(): Promise<AppleContextPreview> {
  if (!isTauriRuntime()) {
    throw new Error("Apple app context preview is available only inside the Tauri desktop runtime.");
  }

  return invoke<AppleContextPreview>("load_apple_context_preview");
}

export async function loadExternalAuthRequirements(): Promise<ExternalAuthRequirement[]> {
  if (!isTauriRuntime()) {
    throw new Error("OAuth requirements are available only inside the Tauri desktop runtime.");
  }

  return invoke<ExternalAuthRequirement[]>("load_external_auth_requirements");
}
