import type { APIRoute } from "astro";

import { DumpService } from "@/lib/services/dump";

// Downloads a dumped file's original. It lives under /admin so the Founder's
// login protects it. Always served as a download, so an uploaded HTML file
// can't run in the dashboard's origin.
export const GET: APIRoute = async ({ locals, params }) => {
  const { DB, DUMP } = locals.runtime.env;
  const dump = new DumpService(DB, DUMP);
  const file = await dump.getById(Number(params.id));
  const object = file ? await dump.getOriginal(file) : null;
  if (!file || !object) return new Response("Not found", { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Content-Length": String(object.size),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
};
