import { describe, expect, it } from "vitest";
import { canRunCapability, requiresApproval } from "@/capabilities/approval-policy";

const context = {
  trustedFileRoots: ["/Users/pavlosamoshko/Documents"],
  permissionGranted: true,
  explicitApproval: false,
};

describe("capability approval policy", () => {
  it("requires approval for mail.send", () => {
    expect(requiresApproval("mail.send")).toBe(true);
    expect(canRunCapability("mail.send", context)).toBe(false);
  });

  it("requires approval for calendar.create_event", () => {
    expect(requiresApproval("calendar.create_event")).toBe(true);
    expect(canRunCapability("calendar.create_event", context)).toBe(false);
  });

  it("respects trusted roots for file reads", () => {
    expect(canRunCapability("files.read", context, { path: "/Users/pavlosamoshko/Documents/a.pdf" })).toBe(true);
    expect(canRunCapability("files.read", context, { path: "/Users/pavlosamoshko/Secrets/a.pdf" })).toBe(false);
  });

  it("allows safe reads after permission exists", () => {
    expect(requiresApproval("mail.read")).toBe(false);
    expect(canRunCapability("mail.read", context)).toBe(true);
  });
});
