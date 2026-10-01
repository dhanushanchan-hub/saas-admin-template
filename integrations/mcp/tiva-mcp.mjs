#!/usr/bin/env node
// TIVA HQ MCP server — exposes the Founder's executive team and cloud agents as
// tools to any MCP client (Claude Desktop, Claude Code, Cursor). It's a thin,
// zero-dependency bridge over the same TIVA HQ REST API the dashboard uses.
//
// Transport: stdio, newline-delimited JSON-RPC 2.0 (the MCP stdio transport).
// Nothing is printed to stdout except protocol messages; logs go to stderr.
//
// Configure with environment variables:
//   TIVA_HQ_URL     Base URL of TIVA HQ, e.g. https://tiva-hq.example.workers.dev
//   TIVA_HQ_TOKEN   The API_TOKEN secret configured on the Worker
//   TIVA_HQ_ACCESS_CLIENT_ID / TIVA_HQ_ACCESS_CLIENT_SECRET
//                   Optional Cloudflare Access service token.

import { createInterface } from "node:readline";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "tiva-hq", version: "1.0.0" };

const baseUrl = (process.env.TIVA_HQ_URL || "").replace(/\/+$/, "");
const token = process.env.TIVA_HQ_TOKEN || "";

const log = (...args) => console.error("[tiva-mcp]", ...args);

const api = async (method, path, body) => {
  if (!baseUrl) throw new Error("TIVA_HQ_URL is not set.");
  if (!token) throw new Error("TIVA_HQ_TOKEN is not set.");
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  if (process.env.TIVA_HQ_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = process.env.TIVA_HQ_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] =
      process.env.TIVA_HQ_ACCESS_CLIENT_SECRET || "";
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    throw new Error(data?.message || `Request failed (${response.status})`);
  }
  return data;
};

// The tools this server offers. Each maps to one TIVA HQ API call.
const tools = [
  {
    name: "tiva_brief",
    description:
      "Get the Founder's briefing: missions in flight, the latest briefs and the decisions waiting on the Founder.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => api("GET", "/api/briefing"),
  },
  {
    name: "tiva_start_mission",
    description:
      "Give the executive team a directive. Hermes plans it and the executives work in the background; poll tiva_mission_status for the brief.",
    inputSchema: {
      type: "object",
      properties: {
        directive: { type: "string", description: "What you need done, in full." },
        title: { type: "string", description: "Optional short title." },
        entity_id: { type: "string", description: "Optional entity id it's for." },
        priority: {
          type: "string",
          enum: ["low", "normal", "high", "critical"],
          description: "Optional priority.",
        },
      },
      required: ["directive"],
      additionalProperties: false,
    },
    run: (args) =>
      api("POST", "/api/missions", { ...args, origin: "api" }),
  },
  {
    name: "tiva_mission_status",
    description: "Get one mission with its plan, deliverables, brief and decisions.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "number", description: "Mission id." } },
      required: ["id"],
      additionalProperties: false,
    },
    run: (args) => api("GET", `/api/missions/${encodeURIComponent(args.id)}`),
  },
  {
    name: "tiva_remember",
    description:
      "Teach the team something lasting (a fact, goal, preference). Every agent it applies to sees it on future missions.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "What to remember." },
        title: { type: "string", description: "Optional short title." },
        scope: {
          type: "string",
          enum: ["global", "department", "entity", "agent"],
          description: "Who it applies to (default global).",
        },
        scope_ref: { type: "string", description: "The department, entity or agent id." },
      },
      required: ["content"],
      additionalProperties: false,
    },
    run: (args) =>
      api("POST", "/api/knowledge", { scope: "global", ...args }),
  },
  {
    name: "tiva_cloud_dispatch",
    description:
      "Hand a task to an outside agent platform. platform 'manus' starts a real Manus task; others (claude-code, codex, opencode, openclaw, hermes, gemini) record a handoff.",
    inputSchema: {
      type: "object",
      properties: {
        platform: {
          type: "string",
          enum: [
            "manus",
            "claude-code",
            "codex",
            "opencode",
            "openclaw",
            "hermes",
            "gemini",
          ],
        },
        prompt: { type: "string", description: "The task." },
        title: { type: "string" },
        profile: { type: "string", description: "Manus profile, optional." },
      },
      required: ["platform", "prompt"],
      additionalProperties: false,
    },
    run: (args) => api("POST", "/api/agents/cloud", { ...args, origin: "api" }),
  },
  {
    name: "tiva_agents",
    description: "List the executive team.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => api("GET", "/api/agents"),
  },
  {
    name: "tiva_entities",
    description: "List the group structure (holding companies and their entities).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: () => api("GET", "/api/entities"),
  },
];

const toolByName = new Map(tools.map((tool) => [tool.name, tool]));

const send = (message) => {
  process.stdout.write(JSON.stringify(message) + "\n");
};

const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const replyError = (id, code, message) =>
  send({ jsonrpc: "2.0", id, error: { code, message } });

const handle = async (message) => {
  const { id, method, params } = message;

  // Notifications (no id) need no response.
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") log("client ready");
    return;
  }

  try {
    if (method === "initialize") {
      reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
      return;
    }
    if (method === "ping") {
      reply(id, {});
      return;
    }
    if (method === "tools/list") {
      reply(id, {
        tools: tools.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      });
      return;
    }
    if (method === "tools/call") {
      const tool = toolByName.get(params?.name);
      if (!tool) {
        replyError(id, -32602, `Unknown tool: ${params?.name}`);
        return;
      }
      try {
        const result = await tool.run(params.arguments ?? {});
        reply(id, {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        });
      } catch (error) {
        // Tool errors are reported in-band so the model can react to them.
        reply(id, {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        });
      }
      return;
    }
    replyError(id, -32601, `Method not found: ${method}`);
  } catch (error) {
    replyError(id, -32603, error.message);
  }
};

const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let message;
  try {
    message = JSON.parse(trimmed);
  } catch {
    log("ignoring non-JSON line");
    return;
  }
  handle(message).catch((error) => log("handler error:", error.message));
});

log(`ready — ${tools.length} tools, HQ ${baseUrl || "(TIVA_HQ_URL unset)"}`);
