import type { APIRoute } from "astro";

import { DumpService } from "@/lib/services/dump";
import { notFound, unauthorized } from "@/lib/agents/http";

// One dumped file with the text read out of it.
export const GET: APIRoute = async ({ locals, params, request }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const dump = new DumpService(locals.runtime.env.DB);
  const file = await dump.getById(Number(params.id));
  if (!file) return notFound("File");
  return Response.json({ file, text: await dump.getText(file.id) });
};

// Removes the file, its stored original and its text.
export const DELETE: APIRoute = async ({ locals, params, request }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const { DB, DUMP } = locals.runtime.env;
  const deleted = await new DumpService(DB, DUMP).delete(Number(params.id));
  if (!deleted) return notFound("File");
  return new Response(null, { status: 204 });
};
