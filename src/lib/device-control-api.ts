import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/tauri";
import type {
  DesktopObservation,
  DesktopPermissionStatus,
  DeviceActionResult,
  OpenAppRequest,
  PasteTextRequest,
  ReplaceSelectionRequest,
  SelectedTextResult,
} from "@/types/device-control";

export async function loadDesktopPermissionStatus(): Promise<DesktopPermissionStatus> {
  ensureTauri("Desktop control permissions are available only inside the Tauri desktop runtime.");
  return invoke<DesktopPermissionStatus>("desktop_permission_status");
}

export async function observeDesktop(): Promise<DesktopObservation> {
  ensureTauri("Desktop observation is available only inside the Tauri desktop runtime.");
  return invoke<DesktopObservation>("desktop_observe");
}

export async function readSelectedText(): Promise<SelectedTextResult> {
  ensureTauri("Selected-text capture is available only inside the Tauri desktop runtime.");
  return invoke<SelectedTextResult>("desktop_read_selected_text");
}

export async function pasteTextToActiveApp(request: PasteTextRequest): Promise<DeviceActionResult> {
  ensureTauri("Desktop paste is available only inside the Tauri desktop runtime.");
  return invoke<DeviceActionResult>("desktop_paste_text", { request });
}

export async function replaceSelectionInActiveApp(request: ReplaceSelectionRequest): Promise<DeviceActionResult> {
  ensureTauri("Desktop selection replacement is available only inside the Tauri desktop runtime.");
  return invoke<DeviceActionResult>("desktop_replace_selection", { request });
}

export async function openDesktopApp(request: OpenAppRequest): Promise<DeviceActionResult> {
  ensureTauri("Desktop app opening is available only inside the Tauri desktop runtime.");
  return invoke<DeviceActionResult>("desktop_open_app", { request });
}

function ensureTauri(message: string) {
  if (!isTauriRuntime()) {
    throw new Error(message);
  }
}
