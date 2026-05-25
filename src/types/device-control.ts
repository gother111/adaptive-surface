export type PermissionState = "granted" | "needed" | "unknown" | "unsupported";

export interface PermissionCheck {
  status: PermissionState;
  label: string;
  reason?: string | null;
}

export interface DesktopPermissionStatus {
  platform: string;
  supported: boolean;
  accessibility: PermissionCheck;
  screenRecording: PermissionCheck;
  automation: PermissionCheck;
  instructions: string[];
  checkedAtMs: number;
}

export interface ActiveAppInfo {
  name: string;
  bundleId?: string | null;
  processId?: number | null;
}

export interface ActiveWindowInfo {
  title?: string | null;
}

export interface SelectedTextResult {
  text: string;
  source: string;
  confidence: number;
  warnings: string[];
}

export interface DesktopObservation {
  platform: string;
  supported: boolean;
  activeApp?: ActiveAppInfo | null;
  activeWindow?: ActiveWindowInfo | null;
  selectedText?: SelectedTextResult | null;
  permissionStatus: DesktopPermissionStatus;
  capturedAtMs: number;
  warnings: string[];
}

export interface PasteTextRequest {
  text: string;
  restoreClipboard?: boolean;
}

export interface ReplaceSelectionRequest {
  text: string;
  restoreClipboard?: boolean;
}

export interface OpenAppRequest {
  bundleId?: string;
  appName?: string;
}

export interface DeviceActionResult {
  ok: boolean;
  action: string;
  message: string;
  requiresUserApproval: boolean;
  warnings: string[];
}
