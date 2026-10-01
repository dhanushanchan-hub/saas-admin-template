// TIVA Cloud dispatch: one place to hand a task to an outside agent platform and
// to refresh its status. Used by the /api/agents/cloud routes and by Hermes.

import { ActivityService } from "../services/activity";
import { CloudRunService } from "../services/cloud";
import {
  createManusTask,
  getManusTask,
  manusConfig,
  ManusError,
} from "./manus";
import type {
  AgentTeamEnv,
  CloudPlatform,
  CloudRun,
  CloudRunOrigin,
} from "./types";

export const CLOUD_PLATFORMS: CloudPlatform[] = [
  "manus",
  "claude-code",
  "codex",
  "opencode",
  "openclaw",
  "hermes",
  "gemini",
];

export const PLATFORM_LABELS: Record<CloudPlatform, string> = {
  manus: "Manus",
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  openclaw: "OpenClaw",
  hermes: "Hermes Agent",
  gemini: "Gemini CLI",
};

// Only Manus is driven from TIVA HQ over an API. The rest run on their own
// hosted or desktop surfaces and connect back through the tiva-agent-team skill,
// so dispatching to them here records a tracked handoff rather than starting them.
export const isApiDriven = (platform: CloudPlatform) => platform === "manus";

export type DispatchInput = {
  platform: CloudPlatform;
  prompt: string;
  title?: string;
  profile?: string;
  origin?: CloudRunOrigin;
  mission_id?: number | null;
};

const fallbackTitle = (prompt: string) => {
  const line = prompt.trim().split("\n")[0].trim();
  return (line.length > 80 ? `${line.slice(0, 79)}…` : line) || "Untitled task";
};

// Hands a task to a platform. For Manus this starts a real task; for the others
// it records a handoff the Founder or an agent will run on that platform.
export const dispatchCloudRun = async (
  env: AgentTeamEnv,
  input: DispatchInput,
): Promise<CloudRun> => {
  const runs = new CloudRunService(env.DB);
  const activity = new ActivityService(env.DB);
  const title = input.title?.trim() || fallbackTitle(input.prompt);
  const origin = input.origin ?? "founder";

  if (input.platform === "manus") {
    const config = manusConfig(env);
    if (!config) {
      throw new ManusError(
        "Manus isn't connected. Set the MANUS_API_KEY secret with `npx wrangler secret put MANUS_API_KEY`.",
      );
    }
    const task = await createManusTask(config, {
      prompt: input.prompt,
      profile: input.profile,
    });
    const run = await runs.create({
      platform: "manus",
      title: task.title?.trim() || title,
      prompt: input.prompt,
      profile: input.profile?.trim() || config.profile,
      status: task.status,
      external_id: task.id,
      external_url: task.url,
      detail: task.detail,
      origin,
      mission_id: input.mission_id ?? null,
    });
    await activity.log({
      kind: "cloud",
      message: `Sent a task to Manus: ${run.title}`,
      mission_id: input.mission_id ?? null,
    });
    return run;
  }

  const run = await runs.create({
    platform: input.platform,
    title,
    prompt: input.prompt,
    profile: input.profile ?? null,
    status: "queued",
    detail: `Handed to ${PLATFORM_LABELS[input.platform]}. It runs on its own surface and reports back through the tiva-agent-team skill.`,
    origin,
    mission_id: input.mission_id ?? null,
  });
  await activity.log({
    kind: "cloud",
    message: `Logged a handoff to ${PLATFORM_LABELS[input.platform]}: ${run.title}`,
    mission_id: input.mission_id ?? null,
  });
  return run;
};

// Re-reads a Manus run's status from Manus and saves any change. Other platforms
// have no API to poll, so their rows are returned unchanged.
export const refreshCloudRun = async (
  env: AgentTeamEnv,
  run: CloudRun,
): Promise<CloudRun> => {
  if (run.platform !== "manus" || !run.external_id) return run;
  const config = manusConfig(env);
  if (!config) return run;

  const task = await getManusTask(config, run.external_id);
  const runs = new CloudRunService(env.DB);
  await runs.update(run.id, {
    status: task.status,
    external_url: task.url ?? run.external_url,
    detail: task.detail ?? run.detail,
  });
  return (await runs.getById(run.id)) ?? run;
};
