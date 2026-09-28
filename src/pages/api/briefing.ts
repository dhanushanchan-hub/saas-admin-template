import { MissionService } from "@/lib/services/mission";
import { unauthorized } from "@/lib/agents/http";

// A compact snapshot for the Founder's personal assistant (OpenClaw, Hermes
// Agent, a chat bot...): what's in flight, the latest briefs, and the
// decisions waiting on the Founder.
export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const missionService = new MissionService(locals.runtime.env.DB);
  const [stats, recent, openDecisions] = await Promise.all([
    missionService.getStats(),
    missionService.getAll({ limit: 20 }),
    missionService.getOpenDecisions(),
  ]);

  return Response.json({
    stats,
    in_flight: recent
      .filter((mission) => !["completed", "failed"].includes(mission.status))
      .map(({ id, title, status, priority, created_at }) => ({
        id,
        title,
        status,
        priority,
        created_at,
      })),
    latest_briefs: recent
      .filter((mission) => mission.status === "completed")
      .slice(0, 3)
      .map(({ id, title, brief, completed_at }) => ({
        id,
        title,
        brief,
        completed_at,
      })),
    decisions: openDecisions.map(({ mission, decision }) => ({
      mission_id: mission.id,
      mission_title: mission.title,
      ...decision,
    })),
  });
}
