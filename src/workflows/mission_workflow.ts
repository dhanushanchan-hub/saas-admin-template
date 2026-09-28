import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStepConfig } from "cloudflare:workers";

import {
  endTask,
  errorMessage,
  executeTask,
  failMission,
  planMission,
  synthesizeMission,
} from "../lib/agents/orchestrator";
import type { AgentTeamEnv } from "../lib/agents/types";

type Params = {
  missionId: number;
};

// Model calls can take minutes on hard assignments; transient API errors are
// retried with backoff before the step is treated as failed.
const AGENT_STEP: WorkflowStepConfig = {
  retries: { limit: 3, delay: "30 seconds", backoff: "exponential" },
  timeout: "15 minutes",
};

// Runs one mission end to end: Hermes plans, specialists work in dependency
// order (independent assignments in parallel), then Hermes writes the brief.
// Every step is durable, so a mission survives restarts and deploys.
export class MissionWorkflow extends WorkflowEntrypoint<AgentTeamEnv, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { missionId } = event.payload;

    try {
      const tasks = await step.do("plan", AGENT_STEP, () =>
        planMission(this.env, missionId),
      );

      const finished = new Map<string, "completed" | "failed" | "skipped">();
      let remaining = tasks;

      while (remaining.length) {
        const ready = remaining.filter((task) =>
          task.depends_on.every((dep) => finished.has(dep)),
        );
        // The planner only allows dependencies on earlier assignments, so
        // something is always ready; this guards against a malformed plan.
        if (!ready.length) break;

        await Promise.all(
          ready.map(async (task) => {
            const blocker = task.depends_on.find(
              (dep) => finished.get(dep) !== "completed",
            );
            if (blocker) {
              await step.do(`skip task ${task.id}`, () =>
                endTask(this.env, task.id, "skipped", `it depends on "${blocker}", which did not complete`),
              );
              finished.set(task.step_key, "skipped");
              return;
            }

            try {
              await step.do(`task ${task.id} (${task.agent_id})`, AGENT_STEP, () =>
                executeTask(this.env, task.id),
              );
              finished.set(task.step_key, "completed");
            } catch (error) {
              await step.do(`record failure of task ${task.id}`, () =>
                endTask(this.env, task.id, "failed", errorMessage(error)),
              );
              finished.set(task.step_key, "failed");
            }
          }),
        );

        remaining = remaining.filter((task) => !finished.has(task.step_key));
      }

      await step.do("brief", AGENT_STEP, () =>
        synthesizeMission(this.env, missionId),
      );
    } catch (error) {
      await step.do("record mission failure", () =>
        failMission(this.env, missionId, errorMessage(error)),
      );
      throw error;
    }
  }
}
