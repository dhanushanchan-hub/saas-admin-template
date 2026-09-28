import type { APIRoute } from "astro";

import { DumpService } from "@/lib/services/dump";
import { unauthorized } from "@/lib/agents/http";

const bucketMissing = () =>
  Response.json(
    { message: "The DUMP storage bucket isn't connected to this Worker." },
    { status: 503 },
  );

const fileName = (header: string | null) => {
  if (!header) return "";
  try {
    return decodeURIComponent(header).replace(/[\\/]/g, "_").trim().slice(0, 200);
  } catch {
    return "";
  }
};

// Lists the dump, or searches it with ?q=.
export const GET: APIRoute = async ({ locals, request, url }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const dump = new DumpService(locals.runtime.env.DB);
  const query = url.searchParams.get("q")?.trim();
  if (query) {
    const limit = Math.min(Number(url.searchParams.get("limit")) || 20, 50);
    return Response.json({ results: await dump.search(query, limit) });
  }
  const [files, stats] = await Promise.all([dump.list(), dump.stats()]);
  return Response.json({ files, stats });
};

// Uploads one file as the raw request body. Send its name in X-File-Name
// (URI-encoded) and its type in X-File-Type, with
// Content-Type: application/octet-stream.
export const POST: APIRoute = async ({ locals, request }) => {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const { AI, DB, DUMP } = locals.runtime.env;
  if (!DUMP) return bucketMissing();

  const name = fileName(request.headers.get("x-file-name"));
  if (!name) {
    return Response.json({ message: "X-File-Name header is required" }, { status: 400 });
  }
  const size = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isFinite(size) || size <= 0) {
    return Response.json(
      { message: "Send the file as the request body, with a Content-Length header" },
      { status: 411 },
    );
  }
  const mimeType =
    (request.headers.get("x-file-type") || request.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase() || "application/octet-stream";

  const file = await new DumpService(DB, DUMP).addUpload({
    name,
    mimeType,
    size,
    body: request.body,
    ai: AI,
  });
  return Response.json({ file }, { status: 201 });
};
