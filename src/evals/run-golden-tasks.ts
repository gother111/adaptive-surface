import { routeVoiceAction, routedActionToPatches } from "@/workspace/voice-router";
import { applyWorkspacePatches, createInitialWorkspaceSession } from "@/workspace/workspace-reducer";
import type { WorkspaceSession } from "@/workspace/types";
import { applyObjectiveRouting } from "@/objectives/objective-reducer";
import { getActiveObjective } from "@/objectives/objective-memory";
import { routeUtteranceToObjectiveFrame } from "@/objectives/objective-router";
import type { ObjectiveFrame } from "@/objectives/objective-types";
import { requiresApproval } from "@/capabilities/approval-policy";
import { goldenTasks } from "@/evals/golden-tasks";
import type { GoldenEvalReport, GoldenTask, GoldenTaskResult } from "@/evals/seemless-bench-types";
import { shouldRunFoundationBeforeWorkspace } from "@/local-context/context-routing-contract";
import { routeFoundationCommand } from "@/local-context/work-command-router";
import { assignWorkspaceLayout, shouldCommandBecomePrimary } from "@/workspace/layout/workspace-layout-engine";

export function runGoldenTasks(tasks: GoldenTask[] = goldenTasks): GoldenEvalReport {
  const results = tasks.map(runGoldenTask);
  const passCount = results.filter((result) => result.passed).length;

  return {
    taskCount: tasks.length,
    passCount,
    failCount: tasks.length - passCount,
    metrics: {
      objectiveRoutingAccuracy: ratio(results, "objective"),
      surfacePersistenceRate: ratio(results, "persistence"),
      correctSupportingSurfaceRate: ratio(results, "supporting"),
      approvalSafetyRate: ratio(results, "approval"),
      contextRefreshCorrectness: ratio(results, "context"),
      unknownFallbackRate: ratio(results, "unknown"),
    },
    results,
  };
}

function runGoldenTask(task: GoldenTask): GoldenTaskResult {
  let session: WorkspaceSession = createInitialWorkspaceSession();
  let objectives: ObjectiveFrame[] = [];
  let activeObjectiveId: string | null = null;
  const failures: string[] = [];
  let refreshedContext = false;
  let approvalRequired = false;

  for (const utterance of task.utterances) {
    const activeObjective = getActiveObjective(objectives, activeObjectiveId);
    const foundationCommand = routeFoundationCommand(utterance);
    if (foundationCommand && shouldRunFoundationBeforeWorkspace(utterance, foundationCommand, session, activeObjective)) {
      const now = Date.now();
      const layout = assignWorkspaceLayout(
        { kind: foundationCommand.surfaceKind as never },
        { makePrimary: shouldCommandBecomePrimary(foundationCommand.surfaceKind as never) },
      );
      const role = foundationCommand.surfaceKind === "approval" ? "temporary" : layout.role;
      const zone = foundationCommand.surfaceKind === "approval" ? "bottomDock" : layout.zone;
      session = applyWorkspacePatches(session, [
        {
          type: "UPSERT_SURFACE",
          surface: {
            id: `foundation-${foundationCommand.surfaceKind}`,
            kind: foundationCommand.surfaceKind as never,
            role,
            zone,
            status: "active",
            createdAt: now,
            updatedAt: now,
            props: { command: utterance, adapter: foundationCommand.adapter },
          },
        },
        ...(role === "primary" || !session.primarySurfaceId ? [{ type: "SET_PRIMARY_SURFACE" as const, surfaceId: `foundation-${foundationCommand.surfaceKind}` }] : []),
        { type: "STORE_CONTEXT_RESULT", key: foundationCommand.surfaceKind, value: foundationCommand.payload },
      ]);
      refreshedContext = refreshedContext || [
        "load_calendar_events",
        "load_mail_messages",
        "load_notes",
        "load_reminders",
        "search_contacts",
        "search_local_files",
        "daily_briefing",
        "payment_triage",
        "meeting_prep",
      ].includes(foundationCommand.adapter);
      approvalRequired = approvalRequired || foundationCommand.requiresApproval;
      continue;
    }

    const decision = routeUtteranceToObjectiveFrame(utterance, activeObjective, objectives);
    const objectiveUpdate = applyObjectiveRouting(objectives, activeObjectiveId, decision, utterance);
    objectives = objectiveUpdate.objectives;
    activeObjectiveId = objectiveUpdate.activeObjectiveId;

    const action = routeVoiceAction(session, utterance);
    const patches = routedActionToPatches(session, action, utterance);
    session = applyWorkspacePatches(session, patches);
    refreshedContext = refreshedContext || patches.some((patch) => patch.type === "STORE_CONTEXT_RESULT" && ["calendar", "mail", "notes"].includes(patch.key));
    approvalRequired = approvalRequired || decision.route === "request_approval" || objectiveUpdate.objectives.some((objective) => objective.plannedActions.some((planned) => requiresApproval(planned.capabilityId)));
  }

  const activeObjective = getActiveObjective(objectives, activeObjectiveId) ?? objectives.sort((left, right) => right.updatedAt - left.updatedAt)[0];
  const primarySurface = session.surfaces.find((surface) => surface.id === session.primarySurfaceId);
  const surfaceKinds = session.surfaces.map((surface) => surface.kind);

  if (task.expected.objectiveKind && activeObjective?.kind !== task.expected.objectiveKind) {
    failures.push(`objective: expected ${task.expected.objectiveKind}, got ${activeObjective?.kind ?? "none"}`);
  }

  if (task.expected.primarySurfaceKind && primarySurface?.kind !== task.expected.primarySurfaceKind) {
    failures.push(`primary surface: expected ${task.expected.primarySurfaceKind}, got ${primarySurface?.kind ?? "none"}`);
  }

  for (const supportingKind of task.expected.supportingSurfaceKinds ?? []) {
    if (!surfaceKinds.includes(supportingKind as never)) {
      failures.push(`supporting: missing ${supportingKind}`);
    }
  }

  if (task.expected.shouldPersistSurface && session.surfaces.length === 0) {
    failures.push("persistence: expected at least one persistent surface");
  }

  if (task.expected.requiresApproval && !approvalRequired) {
    failures.push("approval: expected approval requirement");
  }

  if (task.expected.shouldRefreshAppleContext && !refreshedContext) {
    failures.push("context: expected Apple context refresh signal");
  }

  for (const forbidden of task.expected.forbiddenActions ?? []) {
    if (!requiresApproval(forbidden)) {
      failures.push(`approval: forbidden action ${forbidden} is not approval-gated`);
    }
  }

  return { id: task.id, title: task.title, passed: failures.length === 0, failures };
}

function ratio(results: GoldenTaskResult[], failurePrefix: string) {
  const relevant = results.filter((result) => result.failures.some((failure) => failure.startsWith(failurePrefix)) || result.passed);
  if (!relevant.length) return 1;
  return Number((relevant.filter((result) => !result.failures.some((failure) => failure.startsWith(failurePrefix))).length / relevant.length).toFixed(3));
}

if (process.argv[1]?.endsWith("run-golden-tasks.ts")) {
  const report = runGoldenTasks();
  console.log(JSON.stringify(report, null, 2));
  if (report.failCount > 0) {
    process.exitCode = 1;
  }
}
