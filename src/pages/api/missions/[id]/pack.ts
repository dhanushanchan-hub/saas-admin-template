import type { APIRoute } from "astro";

import { buildPack } from "@/lib/agents/build-pack";
import { notFound, unauthorized } from "@/lib/agents/http";
import { AgentService } from "@/lib/services/agent";
import { EntityService } from "@/lib/services/entity";
import { MissionService } from "@/lib/services/mission";

// A mission's build pack as Markdown, for Claude Code and other coding agents
// (the tiva-agent-team skill's build-pack command reads it).
export const GET: APIRoute = async ({ locals, request, params, url }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const { DB } = locals.runtime.env;
  const missionService = new MissionService(DB);
  const mission = await missionService.getById(Number(params.id));
  if (!mission) return notFound("Mission");

  const [tasks, agents, entity] = await Promise.all([
    missionService.getTasks(mission.id),
    new AgentService(DB).getAll(),
    mission.entity_id ? new EntityService(DB).getById(mission.entity_id) : null,
  ]);

  const pack = buildPack({
    mission,
    entity,
    tasks,
    agents: new Map(agents.map((agent) => [agent.id, agent])),
    url: `${url.origin}/admin/missions/${mission.id}`,
  });
  return new Response(pack, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
