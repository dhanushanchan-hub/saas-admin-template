import { RoutineService } from "@/lib/services/routine";
import { launchRoutine } from "@/workflows/scheduler";
import { missingModelKey, notFound, unauthorized } from "@/lib/agents/http";

// Runs a routine now, outside its schedule.
export async function POST({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;
  const unavailable = missingModelKey(locals);
  if (unavailable) return unavailable;

  const routine = await new RoutineService(locals.runtime.env.DB).getById(
    params.id,
  );
  if (!routine) return notFound("Routine");

  const mission = await launchRoutine(locals.runtime.env, routine);
  return Response.json({ mission }, { status: 202 });
}
