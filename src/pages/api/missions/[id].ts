import { MissionService } from "@/lib/services/mission";
import { notFound, unauthorized } from "@/lib/agents/http";

export async function GET({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const missionService = new MissionService(locals.runtime.env.DB);
  const mission = await missionService.getById(Number(params.id));
  if (!mission) return notFound("Mission");

  const tasks = await missionService.getTasks(mission.id);
  return Response.json({ mission, tasks });
}
