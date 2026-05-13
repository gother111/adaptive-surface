import { invoke } from "@tauri-apps/api/core";

export const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export async function runAppleScript(script: string): Promise<string> {
  if (!isTauriRuntime()) {
    return "AppleScript is available only inside the Tauri desktop runtime.";
  }

  return invoke<string>("run_applescript", { script });
}
