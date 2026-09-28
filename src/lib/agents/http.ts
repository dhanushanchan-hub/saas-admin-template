import type * as z from "zod";

import { validateApiTokenResponse } from "@/lib/api";

// Returns a 401 response when the request doesn't carry the API token.
export const unauthorized = (locals: App.Locals, request: Request) =>
  validateApiTokenResponse(request, locals.runtime.env.API_TOKEN);

export const invalid = (error: z.ZodError) =>
  Response.json(
    { message: "Invalid request", issues: error.issues },
    { status: 400 },
  );

export const notFound = (what: string) =>
  Response.json({ message: `${what} not found` }, { status: 404 });

export const readJson = async (request: Request) => {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
};

export const missingModelKey = (locals: App.Locals) =>
  locals.runtime.env.ANTHROPIC_API_KEY
    ? undefined
    : Response.json(
        {
          message:
            "ANTHROPIC_API_KEY is not configured, so the agent team can't run. Set it with `npx wrangler secret put ANTHROPIC_API_KEY`.",
        },
        { status: 503 },
      );
