import * as z from "zod";

import { EntityService } from "@/lib/services/entity";
import { MissionService } from "@/lib/services/mission";
import { launchMission } from "@/lib/agents/orchestrator";
import {
  invalid,
  missingModelKey,
  readJson,
  unauthorized,
} from "@/lib/agents/http";

const listSchema = z.object({
  status: z
    .enum(["queued", "planning", "executing", "synthesizing", "completed", "failed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createSchema = z.object({
  directive: z.string().trim().min(5).max(20000),
  title: z.string().trim().max(120).optional(),
  entity_id: z.string().trim().min(1).nullable().optional(),
  priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
  // "api" marks directives relayed by an external assistant such as OpenClaw.
  origin: z.enum(["founder", "api"]).default("founder"),
});

export async function GET({ locals, request, url }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return invalid(parsed.error);

  const missions = await new MissionService(locals.runtime.env.DB).getAll(
    parsed.data,
  );
  return Response.json({ missions });
}

// Gives the team a new directive. Hermes plans it and the team works on it in
// the background; poll GET /api/missions/:id for progress and the brief.
export async function POST({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;
  const unavailable = missingModelKey(locals);
  if (unavailable) return unavailable;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const { env } = locals.runtime;
  const { entity_id } = parsed.data;
  if (entity_id && !(await new EntityService(env.DB).getById(entity_id))) {
    return Response.json(
      { message: `Unknown entity "${entity_id}"` },
      { status: 400 },
    );
  }

  const mission = await launchMission(env, parsed.data);
  return Response.json({ mission }, { status: 202 });
}
