import { describe, expect, it } from "vitest";
import { localCapabilityRegistry, mergeCapabilityDiagnostics } from "@/local-context/capability-registry";
import type { CapabilityDiagnostic } from "@/types/context";

describe("foundation capability registry", () => {
  it("contains Apple, local files, and scaffolded Google capabilities", () => {
    expect(Object.keys(localCapabilityRegistry)).toEqual([
      "apple.mail",
      "apple.calendar",
      "apple.reminders",
      "apple.notes",
      "apple.contacts",
      "local.files",
      "google.calendar",
      "google.drive",
    ]);
    expect(localCapabilityRegistry["google.calendar"].status).toBe("needs-configuration");
    expect(localCapabilityRegistry["local.files"].status).toBe("available");
  });

  it("maps runtime diagnostics onto typed registry statuses", () => {
    const diagnostics: CapabilityDiagnostic[] = [
      {
        id: "apple.mail",
        label: "Apple Mail",
        provider: "Mail AppleScript adapter",
        status: "needs-permission",
        supportedOperations: ["read", "list"],
        lastCheckedAt: 123,
        lastError: "Not authorized",
        permissionInstructions: "Allow Automation.",
        testCommandExamples: ["show recent emails"],
        works: [],
        doesNotWork: ["permission check failed"],
      },
    ];
    const merged = mergeCapabilityDiagnostics(diagnostics);
    expect(merged.find((capability) => capability.id === "apple.mail")?.lastError).toBe("Not authorized");
    expect(merged.find((capability) => capability.id === "google.drive")?.status).toBe("needs-configuration");
  });
});
