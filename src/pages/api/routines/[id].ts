import * as z from "zod";

import { RoutineService } from "@/lib/services/routine";
import { invalid, notFound, readJson, unauthorized } from "@/lib/agents/http";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  directive: z.string().trim().min(5).max(20000).optional(),
  cadence: z.enum(["hourly", "daily", "weekly"]).optional(),
  hour_utc: z.number().int().min(0).max(23).optional(),
  weekday: z.number().int().min(0).max(6).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH({ locals, request, params }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = updateSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const routineService = new RoutineService(locals.runtime.env.DB);
  if (!(await routineService.getById(params.id))) return notFound("Routine");

  const routine = await routineService.update(params.id, parsed.data);
  return Response.json({ routine });
}
