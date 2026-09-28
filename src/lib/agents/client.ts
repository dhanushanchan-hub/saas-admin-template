// Browser-side helpers for the agent team API, used by the admin UI.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const request = async (apiToken: string, path: string, init: RequestInit = {}): Promise<any> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const data: any =
    response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const issue = data?.issues?.[0];
    throw new Error(
      issue
        ? `${issue.path?.join(".") || "request"}: ${issue.message}`
        : (data?.message ?? `Request failed (${response.status})`),
    );
  }
  return data;
};

const send = (apiToken: string, method: string, path: string, body?: unknown) =>
  request(apiToken, path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const agentTeamApi = (apiToken: string) => ({
  createMission: (body: {
    directive: string;
    title?: string;
    entity_id?: string | null;
    priority?: string;
  }) => send(apiToken, "POST", "/api/missions", body),
  updateAgent: (id: string, body: Record<string, unknown>) =>
    send(apiToken, "PATCH", `/api/agents/${id}`, body),
  createKnowledge: (body: {
    title: string;
    content: string;
    scope: string;
    scope_ref?: string | null;
  }) => send(apiToken, "POST", "/api/knowledge", body),
  deleteKnowledge: (id: number) =>
    send(apiToken, "DELETE", `/api/knowledge/${id}`),
  updateRoutine: (id: string, body: Record<string, unknown>) =>
    send(apiToken, "PATCH", `/api/routines/${id}`, body),
  runRoutine: (id: string) => send(apiToken, "POST", `/api/routines/${id}/run`),
  chat: (message: string) =>
    send(apiToken, "POST", "/api/hermes/chat", { message }),
  createEntity: (body: {
    name: string;
    kind: string;
    parent_id?: string | null;
    category?: string;
    region?: string;
    jurisdiction?: string;
    description?: string;
  }) => send(apiToken, "POST", "/api/entities", body),
});
