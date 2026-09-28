import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";

import type { AgentTeamEnv } from "./types";

export const DEFAULT_MODEL = "claude-opus-5";

// Server-side refusal fallbacks ("default" routes by refusal category) are
// available on the Opus 5 and Fable 5 families.
const supportsServerFallback = (model: string) =>
  /^claude-(opus-5|fable-5)/.test(model);

export class AgentCallError extends Error {}

export type AgentCall<Schema extends z.ZodType> = {
  model: string;
  // Identity, charter and operating principles: identical across calls for an
  // agent, so it forms the cached prefix.
  instructions: string;
  // Knowledge base and entity list: changes only when knowledge changes.
  context: string;
  prompt: string;
  schema: Schema;
};

export async function callAgent<Schema extends z.ZodType>(
  env: AgentTeamEnv,
  call: AgentCall<Schema>,
) {
  if (!env.ANTHROPIC_API_KEY) {
    throw new AgentCallError(
      "ANTHROPIC_API_KEY is not configured. Set it with `npx wrangler secret put ANTHROPIC_API_KEY`.",
    );
  }

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
  });

  const response = await client.beta.messages.parse({
    model: call.model,
    max_tokens: 16000,
    ...(supportsServerFallback(call.model)
      ? {
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default" as const,
        }
      : {}),
    system: [
      {
        type: "text",
        text: call.instructions,
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: call.context,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: call.prompt }],
    output_config: { format: betaZodOutputFormat(call.schema) },
  });

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    throw new AgentCallError(`The model declined this request (${category}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AgentCallError("The response hit the output limit before finishing.");
  }
  if (!response.parsed_output) {
    throw new AgentCallError("The response did not match the expected format.");
  }

  return {
    output: response.parsed_output as z.infer<Schema>,
    model: response.model,
    usage: response.usage,
  };
}
