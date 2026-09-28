import { KnowledgeService } from "@/lib/services/knowledge";
import { notFound, unauthorized } from "@/lib/agents/http";

export async function DELETE({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const deleted = await new KnowledgeService(locals.runtime.env.DB).delete(
    Number(params.id),
  );
  if (!deleted) return notFound("Knowledge entry");
  return new Response(null, { status: 204 });
}
