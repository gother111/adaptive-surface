import { describe, expect, it } from "vitest";
import { goldenTasks } from "@/evals/golden-tasks";
import { runGoldenTasks } from "@/evals/run-golden-tasks";

describe("SeemlessBench golden tasks", () => {
  it("executes at least 20 golden tasks", () => {
    expect(goldenTasks.length).toBeGreaterThanOrEqual(20);
    const report = runGoldenTasks();
    expect(report.taskCount).toBe(goldenTasks.length);
    expect(report.failCount).toBe(0);
  });
});
