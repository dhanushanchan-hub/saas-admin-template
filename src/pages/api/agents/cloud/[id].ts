import { CloudRunService } from "@/lib/services/cloud";
import { refreshCloudRun } from "@/lib/agents/cloud";
import { ManusError } from "@/lib/agents/manus";
import { notFound, unauthorized } from "@/lib/agents/http";

// One cloud run. For a Manus run this refreshes its status from Manus first, so
// a poll here always reflects the latest state.
export async function GET({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const service = new CloudRunService(locals.runtime.env.DB);
  const existing = await service.getById(Number(params.id));
  if (!existing) return notFound("Cloud run");

  try {
    const run = await refreshCloudRun(locals.runtime.env, existing);
    return Response.json({ run });
  } catch (error) {
    if (error instanceof ManusError) {
      // Manus was unreachable; return what we have plus the reason.
      return Response.json({ run: existing, warning: error.message });
    }
    throw error;
  }
}
