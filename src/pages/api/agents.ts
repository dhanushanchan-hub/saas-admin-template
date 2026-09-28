import { AgentService } from "@/lib/services/agent";
import { unauthorized } from "@/lib/agents/http";

export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const agents = await new AgentService(locals.runtime.env.DB).getAll();
  return Response.json({ agents });
}
