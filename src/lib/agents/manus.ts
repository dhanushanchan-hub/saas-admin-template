// Bridge to Manus (https://manus.ai): TIVA HQ creates a Manus task and reads its
// status through Manus's HTTP API, so the Founder can hand work to Manus from the
// dashboard and Hermes can delegate to it.
//
// Manus has shipped both a v1 API (header `API_KEY`, body `agentProfile`) and a
// v2 API (header `x-manus-api-key`, body `agent_profile`). The exact surface can
// change and this sandbox can't reach Manus's docs to pin it, so the client is
// deliberately forgiving: the base URL, key header and default profile are all
// configurable, and it reads the response defensively. Defaults target the
// documented v1 shape at https://api.manus.ai.

import type { AgentTeamEnv, CloudRunStatus } from "./types";

const DEFAULT_BASE_URL = "https://api.manus.ai";
const DEFAULT_KEY_HEADER = "API_KEY";
const DEFAULT_PROFILE = "manus-1.6";

export class ManusError extends Error {}

export type ManusConfig = {
  apiKey: string;
  baseUrl: string;
  keyHeader: string;
  profile: string;
};

// Reads Manus settings from the environment, or null when no key is set.
export const manusConfig = (env: AgentTeamEnv): ManusConfig | null => {
  const apiKey = env.MANUS_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: (env.MANUS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    keyHeader: env.MANUS_API_KEY_HEADER?.trim() || DEFAULT_KEY_HEADER,
    profile: env.MANUS_AGENT_PROFILE?.trim() || DEFAULT_PROFILE,
  };
};

export const manusConfigured = (env: AgentTeamEnv) => manusConfig(env) !== null;

// Maps Manus's task states onto TIVA's own cloud-run statuses. Manus has used
// values like "running"/"pending"/"finished"/"stopped"/"failed"; anything we
// don't recognise becomes "unknown" rather than a wrong guess.
export const mapManusStatus = (raw: unknown): CloudRunStatus => {
  const value = String(raw ?? "").toLowerCase();
  if (["queued", "pending", "created", "submitted"].includes(value)) return "queued";
  if (["running", "in_progress", "processing", "started", "active"].includes(value))
    return "running";
  if (["completed", "finished", "success", "succeeded", "done"].includes(value))
    return "completed";
  if (["failed", "error", "errored"].includes(value)) return "failed";
  if (["stopped", "cancelled", "canceled", "terminated"].includes(value)) return "stopped";
  return value ? "unknown" : "queued";
};

export type ManusTask = {
  id: string | null;
  url: string | null;
  status: CloudRunStatus;
  title: string | null;
  detail: string | null;
  raw: unknown;
};

// Pulls the fields we need out of Manus's response, tolerating both the v1 and
// v2 field names (task_id vs id, task_url vs url, and so on).
const readTask = (data: any): ManusTask => {
  const task = data?.task ?? data?.data ?? data ?? {};
  const id = task.task_id ?? task.id ?? task.taskId ?? null;
  const url =
    task.task_url ??
    task.url ??
    task.taskUrl ??
    task.share_url ??
    task.shareUrl ??
    (id ? `https://manus.ai/app/${id}` : null);
  return {
    id: id != null ? String(id) : null,
    url: url != null ? String(url) : null,
    status: mapManusStatus(task.status ?? task.state ?? data?.status),
    title: task.title ?? task.task_title ?? task.name ?? null,
    detail:
      task.status_message ??
      task.message ??
      task.error ??
      data?.message ??
      null,
  raw: data,
  };
};

const call = async (
  config: ManusConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<any> => {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        [config.keyHeader]: config.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ManusError(
      `Couldn't reach Manus: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!response.ok) {
    const detail = data?.message || data?.error || `HTTP ${response.status}`;
    throw new ManusError(`Manus request failed: ${detail}`);
  }
  return data;
};

// Starts a Manus task. `profile` overrides the configured default when set.
export const createManusTask = async (
  config: ManusConfig,
  input: { prompt: string; profile?: string },
): Promise<ManusTask> => {
  const profile = input.profile?.trim() || config.profile;
  // Send both the v1 and v2 field names so either API accepts the body.
  const data = await call(config, "POST", "/v1/tasks", {
    prompt: input.prompt,
    agentProfile: profile,
    agent_profile: profile,
  });
  const task = readTask(data);
  if (!task.id) {
    throw new ManusError("Manus accepted the task but returned no task id.");
  }
  return task;
};

// Reads one Manus task's current state.
export const getManusTask = async (
  config: ManusConfig,
  id: string,
): Promise<ManusTask> => {
  const data = await call(config, "GET", `/v1/tasks/${encodeURIComponent(id)}`);
  return readTask(data);
};
