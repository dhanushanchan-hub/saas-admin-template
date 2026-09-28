// This is a wrapper file for exporting the Astro application together with the
// Workflow classes and the cron handler. This is necessary because Astro does
// not allow us to manually export non-Astro stuff as part of the bundle file.
import astroEntry, { pageMap } from "./_worker.js/index.js";
import { CustomerWorkflow } from "../src/workflows/customer_workflow.js";
import { MissionWorkflow } from "../src/workflows/mission_workflow.js";
import { runDueRoutines } from "../src/workflows/scheduler.js";

export default {
  ...astroEntry,
  // Hourly cron trigger (see wrangler.jsonc): runs the agent team's routines.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runDueRoutines(env, new Date(controller.scheduledTime)));
  },
};
export { CustomerWorkflow, MissionWorkflow, pageMap };
