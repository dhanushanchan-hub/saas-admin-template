import * as z from "zod";

import { ConversationService } from "@/lib/services/conversation";
import { chatWithHermes } from "@/lib/agents/chat";
import {
  invalid,
  missingModelKey,
  readJson,
  unauthorized,
} from "@/lib/agents/http";

const messageSchema = z.object({
  message: z.string().trim().min(1).max(8000),
});

export async function GET({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;

  const messages = await new ConversationService(locals.runtime.env.DB).getRecent(50);
  return Response.json({ messages });
}

// One turn of conversation with Hermes. The reply may come with a mission
// Hermes started or an entry it saved to the team's memory.
export async function POST({ locals, request }) {
  const denied = await unauthorized(locals, request);
  if (denied) return denied;
  const unavailable = missingModelKey(locals);
  if (unavailable) return unavailable;

  const parsed = messageSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  try {
    return Response.json(await chatWithHermes(locals.runtime.env, parsed.data.message));
  } catch (error) {
    console.error("Hermes chat failed:", error);
    return Response.json(
      { message: "Hermes couldn't reply just now. Try again in a moment." },
      { status: 502 },
    );
  }
}
