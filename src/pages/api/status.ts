import { buildStatusSnapshot } from "@/lib/agents/health";
import { unauthorized } from "@/lib/agents/http";

// Live monitoring snapshot for the master junction: every connector's status
// (active / needs a key / connect) plus mission and cloud-run metrics. The
// dashboard polls this; assistants and uptime checks can read it too.
export async function GET({ locals, request, url }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const snapshot = await buildStatusSnapshot(locals.runtime.env, url.origin);
  return Response.json(snapshot);
}
