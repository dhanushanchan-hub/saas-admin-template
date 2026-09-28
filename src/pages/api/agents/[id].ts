import * as z from "zod";

import { AgentService } from "@/lib/services/agent";
import { MissionService } from "@/lib/services/mission";
import { ORCHESTRATOR_ID } from "@/lib/agents/prompts";
import { invalid, notFound, readJson, unauthorized } from "@/lib/agents/http";

const updateSchema = z.object({
  status: z.enum(["active", "paused"]).optional(),
  mission: z.string().trim().min(10).max(500).optional(),
  charter: z.string().trim().min(20).max(8000).optional(),
  model: z.string().trim().min(1).max(100).nullable().optional(),
});

export async function GET({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const { DB } = locals.runtime.env;
  const agent = await new AgentService(DB).getById(params.id);
  if (!agent) return notFound("Agent");

  const tasks = await new MissionService(DB).getTasksByAgent(agent.id);
  return Response.json({ agent, tasks });
}

export async function PATCH({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  if (params.id === ORCHESTRATOR_ID && parsed.data.status === "paused") {
    return Response.json(
      { message: "Hermes runs every mission and can't be paused." },
      { status: 400 },
    );
  }

  const agentService = new AgentService(locals.runtime.env.DB);
  if (!(await agentService.getById(params.id))) return notFound("Agent");

  const agent = await agentService.update(params.id, parsed.data);
  return Response.json({ agent });
}
