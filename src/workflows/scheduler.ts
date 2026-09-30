import { launchMission } from "../lib/agents/orchestrator";
import { RoutineService } from "../lib/services/routine";
import {
  parseDbTime,
  toDbTime,
  type AgentTeamEnv,
  type Routine,
  type RoutineCadence,
} from "../lib/agents/types";

const PERIOD_MS: Record<RoutineCadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

// The most recent time this routine was scheduled to run, at or before `now`.
export const lastOccurrence = (routine: Routine, now: Date) => {
  const at = new Date(now);
  at.setUTCMinutes(0, 0, 0);
  if (routine.cadence === "hourly") return at;

  at.setUTCHours(routine.hour_utc);
  if (routine.cadence === "daily") {
    if (at > now) at.setUTCDate(at.getUTCDate() - 1);
    return at;
  }

  const daysBack = (at.getUTCDay() - routine.weekday + 7) % 7;
  at.setUTCDate(at.getUTCDate() - daysBack);
  if (at > now) at.setUTCDate(at.getUTCDate() - 7);
  return at;
};

// Due when it hasn't run since its latest scheduled time. A new routine waits
// for its first scheduled time after it was created.
export const isDue = (routine: Routine, now: Date) => {
  if (!routine.enabled) return false;
  const since = parseDbTime(routine.last_run_at ?? routine.created_at)!;
  return since < lastOccurrence(routine, now);
};

// When the routine launches next: at the next hourly cron tick if it's due,
// otherwise at its next scheduled time. Null while it's paused.
export const nextRun = (routine: Routine, now: Date) => {
  if (!routine.enabled) return null;
  if (isDue(routine, now)) {
    const tick = new Date(now);
    tick.setUTCHours(tick.getUTCHours() + 1, 0, 0, 0);
    return tick;
  }
  return new Date(lastOccurrence(routine, now).getTime() + PERIOD_MS[routine.cadence]);
};

// Called by the Worker's hourly cron trigger. Launches a mission for every
// routine that is due.
export async function runDueRoutines(env: AgentTeamEnv, now = new Date()) {
  if (!env.ANTHROPIC_API_KEY) {
    console.warn("Skipping routines: ANTHROPIC_API_KEY is not configured.");
    return [];
  }

  const routineService = new RoutineService(env.DB);
  const due = (await routineService.getAll()).filter((routine) =>
    isDue(routine, now),
  );

  const launched = [];
  for (const routine of due) {
    // Mark first so a slow or failed launch can't fire the routine twice.
    await routineService.markRun(routine.id, toDbTime(now));
    launched.push(await launchRoutine(env, routine, now));
  }
  return launched;
}

export const launchRoutine = (env: AgentTeamEnv, routine: Routine, now = new Date()) =>
  launchMission(env, {
    title: `${routine.name}: ${now.toISOString().slice(0, 10)}`,
    directive: routine.directive,
    entity_id: routine.entity_id,
    origin: "routine",
    routine_id: routine.id,
  });
