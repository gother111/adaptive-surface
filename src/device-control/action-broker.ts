export type DeviceActionRisk = "read" | "reversible" | "external" | "destructive";

export type DeviceActionId =
  | "desktop.observe"
  | "desktop.readSelectedText"
  | "desktop.pasteText"
  | "desktop.replaceSelection"
  | "desktop.openApp";

export interface DeviceActionDescriptor {
  id: string;
  label: string;
  risk: DeviceActionRisk;
  description: string;
  requiresApproval: boolean;
}

export interface DeviceActionExecutionContext {
  approved: boolean;
}

export interface DeviceActionExecutionDecision {
  ok: boolean;
  reason: string;
}

const descriptors: Record<DeviceActionId, DeviceActionDescriptor> = {
  "desktop.observe": {
    id: "desktop.observe",
    label: "Observe current app",
    risk: "read",
    description: "Read frontmost app, active window, permission, and selected-text metadata.",
    requiresApproval: false,
  },
  "desktop.readSelectedText": {
    id: "desktop.readSelectedText",
    label: "Read selected text",
    risk: "read",
    description: "Copy the current selection through the clipboard fallback and restore the clipboard when possible.",
    requiresApproval: false,
  },
  "desktop.pasteText": {
    id: "desktop.pasteText",
    label: "Paste text",
    risk: "reversible",
    description: "Paste previewed text into the active app using the clipboard fallback.",
    requiresApproval: true,
  },
  "desktop.replaceSelection": {
    id: "desktop.replaceSelection",
    label: "Replace selection",
    risk: "reversible",
    description: "Replace the current selection in the active app with previewed text.",
    requiresApproval: true,
  },
  "desktop.openApp": {
    id: "desktop.openApp",
    label: "Open app",
    risk: "reversible",
    description: "Activate a specific app by bundle ID or application name.",
    requiresApproval: true,
  },
};

export function getDeviceActionDescriptor(id: DeviceActionId): DeviceActionDescriptor {
  return descriptors[id];
}

export function listDeviceActionDescriptors(): DeviceActionDescriptor[] {
  return Object.values(descriptors);
}

export function requiresDeviceActionApproval(action: DeviceActionId | DeviceActionDescriptor): boolean {
  return resolveDescriptor(action).requiresApproval;
}

export function canExecuteDeviceAction(
  action: DeviceActionId | DeviceActionDescriptor,
  context: DeviceActionExecutionContext,
): DeviceActionExecutionDecision {
  const descriptor = resolveDescriptor(action);

  if (descriptor.risk === "external") {
    return {
      ok: false,
      reason: "External device actions are intentionally out of scope for this runtime version.",
    };
  }

  if (descriptor.risk === "destructive") {
    return {
      ok: false,
      reason: "Destructive device actions are not executable by Adaptive Surface.",
    };
  }

  if (descriptor.requiresApproval && !context.approved) {
    return {
      ok: false,
      reason: `${descriptor.label} changes the active app and needs explicit confirmation.`,
    };
  }

  if (descriptor.risk === "read") {
    return {
      ok: true,
      reason: "Read-only device observations can run after the app has the required permissions.",
    };
  }

  return {
    ok: true,
    reason: "Reversible device action was explicitly approved.",
  };
}

function resolveDescriptor(action: DeviceActionId | DeviceActionDescriptor): DeviceActionDescriptor {
  if (typeof action === "string") {
    return descriptors[action];
  }

  return action;
}
