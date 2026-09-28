import type { APIRoute } from "astro";

import * as z from "zod";

import { DumpService } from "@/lib/services/dump";
import { MAX_TEXT_CHARS } from "@/lib/dump/read";
import { invalid, readJson, unauthorized } from "@/lib/agents/http";

const noteSchema = z.object({
  title: z.string().trim().max(200).optional(),
  content: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

// Dumps text straight in: ideas, plans, meeting notes, a chat transcript.
export const POST: APIRoute = async ({ locals, request }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = noteSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const { content } = parsed.data;
  const title =
    parsed.data.title || content.split("\n")[0].slice(0, 80) || "Untitled note";
  const file = await new DumpService(locals.runtime.env.DB).addNote({ title, content });
  return Response.json({ file }, { status: 201 });
};
