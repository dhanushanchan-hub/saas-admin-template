import * as z from "zod";

import { CloudRunService } from "@/lib/services/cloud";
import { CLOUD_PLATFORMS, dispatchCloudRun } from "@/lib/agents/cloud";
import { ManusError } from "@/lib/agents/manus";
import { invalid, readJson, unauthorized } from "@/lib/agents/http";
import type { CloudPlatform } from "@/lib/agents/types";

const platform = z.enum(
  CLOUD_PLATFORMS as unknown as [CloudPlatform, ...CloudPlatform[]],
);

const listSchema = z.object({
  platform: platform.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createSchema = z.object({
  platform,
  prompt: z.string().trim().min(3).max(20000),
  title: z.string().trim().max(120).optional(),
  profile: z.string().trim().max(80).optional(),
  origin: z.enum(["founder", "api"]).default("api"),
});

export async function GET({ locals, request, url }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = listSchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return invalid(parsed.error);

  const runs = await new CloudRunService(locals.runtime.env.DB).getAll(
    parsed.data,
  );
  return Response.json({ runs });
}

// Hands a task to an outside agent platform. Manus starts immediately; poll
// GET /api/agents/cloud/:id for its status. Other platforms record a handoff.
export async function POST({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  try {
    const run = await dispatchCloudRun(locals.runtime.env, parsed.data);
    return Response.json({ run }, { status: 202 });
  } catch (error) {
    if (error instanceof ManusError) {
      return Response.json({ message: error.message }, { status: 502 });
    }
    throw error;
  }
}
