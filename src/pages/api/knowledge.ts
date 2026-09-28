import * as z from "zod";

import { KnowledgeService } from "@/lib/services/knowledge";
import { invalid, readJson, unauthorized } from "@/lib/agents/http";

const createSchema = z
  .object({
    title: z.string().trim().min(2).max(200),
    content: z.string().trim().min(2).max(20000),
    scope: z.enum(["global", "department", "entity", "agent"]).default("global"),
    scope_ref: z.string().trim().min(1).nullable().optional(),
  })
  .refine((entry) => entry.scope === "global" || entry.scope_ref, {
    message: "scope_ref is required unless scope is global",
    path: ["scope_ref"],
  });

export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const knowledge = await new KnowledgeService(locals.runtime.env.DB).getAll();
  return Response.json({ knowledge });
}

// Teaches the whole team (or one department, entity or agent) something new.
export async function POST({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const entry = await new KnowledgeService(locals.runtime.env.DB).create({
    ...parsed.data,
    source: "founder",
  });
  return Response.json({ entry }, { status: 201 });
}
