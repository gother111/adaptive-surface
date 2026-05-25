import { describe, expect, it } from "vitest";
import {
  canExecuteDeviceAction,
  getDeviceActionDescriptor,
  requiresDeviceActionApproval,
} from "@/device-control/action-broker";

describe("device control action broker", () => {
  it("allows read actions without per-action approval", () => {
    expect(requiresDeviceActionApproval("desktop.observe")).toBe(false);
    expect(canExecuteDeviceAction("desktop.observe", { approved: false })).toEqual({
      ok: true,
      reason: "Read-only device observations can run after the app has the required permissions.",
    });
  });

  it("requires confirmation for reversible text mutation actions", () => {
    expect(requiresDeviceActionApproval("desktop.pasteText")).toBe(true);
    expect(requiresDeviceActionApproval("desktop.replaceSelection")).toBe(true);
    expect(canExecuteDeviceAction("desktop.replaceSelection", { approved: false })).toEqual({
      ok: false,
      reason: "Replace selection changes the active app and needs explicit confirmation.",
    });
    expect(canExecuteDeviceAction("desktop.replaceSelection", { approved: true }).ok).toBe(true);
  });

  it("blocks external and destructive actions in the first runtime version", () => {
    expect(canExecuteDeviceAction({
      id: "desktop.submitForm",
      label: "Submit form",
      risk: "external",
      description: "Submit the active form.",
      requiresApproval: true,
    }, { approved: true })).toEqual({
      ok: false,
      reason: "External device actions are intentionally out of scope for this runtime version.",
    });

    expect(canExecuteDeviceAction({
      id: "desktop.deleteFile",
      label: "Delete file",
      risk: "destructive",
      description: "Delete a file.",
      requiresApproval: true,
    }, { approved: true })).toEqual({
      ok: false,
      reason: "Destructive device actions are not executable by Adaptive Surface.",
    });
  });

  it("describes open app as approval-gated and reversible", () => {
    const descriptor = getDeviceActionDescriptor("desktop.openApp");

    expect(descriptor.risk).toBe("reversible");
    expect(descriptor.requiresApproval).toBe(true);
  });
});
