import * as z from "zod";

import { EntityService } from "@/lib/services/entity";
import { invalid, readJson, unauthorized } from "@/lib/agents/http";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z
    .enum(["holding", "subholding", "subsidiary", "brand", "venture"])
    .default("subsidiary"),
  parent_id: z.string().trim().min(1).nullable().optional(),
  category: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  jurisdiction: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "entity";

export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  // Parent-first order; each entity carries its depth in the structure.
  const entities = await new EntityService(locals.runtime.env.DB).getTree();
  return Response.json({ entities });
}

export async function POST({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const parsed = createSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const entityService = new EntityService(locals.runtime.env.DB);
  const id = slugify(parsed.data.name);
  if (await entityService.getById(id)) {
    return Response.json(
      { message: `An entity with id "${id}" already exists` },
      { status: 409 },
    );
  }

  const { parent_id } = parsed.data;
  if (parent_id && !(await entityService.getById(parent_id))) {
    return Response.json(
      { message: `Unknown parent entity "${parent_id}"` },
      { status: 400 },
    );
  }

  const entity = await entityService.create({ id, ...parsed.data });
  return Response.json({ entity }, { status: 201 });
}
