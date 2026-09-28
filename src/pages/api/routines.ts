import { RoutineService } from "@/lib/services/routine";
import { unauthorized } from "@/lib/agents/http";

export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const routines = await new RoutineService(locals.runtime.env.DB).getAll();
  return Response.json({ routines });
}
