# TIVA system architecture — start to end

Everything TIVA runs, and how the pieces fit, from the Founder's request down to
the agents doing the work. Nothing here is skipped.

## The one-paragraph version

**TIVA HQ** is a Cloudflare Worker (Astro + D1 + R2 + Workflows) that runs the
Founder's executive team of Claude agents. The Founder gives a directive; Hermes
plans it; the executives run as a durable Cloudflare Workflow and return one
brief. **TIVA Cloud** extends HQ to hand work to outside agents (Manus over its
API; Claude Code, Codex, OpenClaw, Hermes Agent, Gemini, Copilot via a skill)
and shows every connector's status on a **master junction**. An **MCP server**
exposes the team to desktop clients; a **desktop script** wires a Windows machine
to all of it; a **self-hosted stack** runs the Founder's own tools.

## Layer 1 — TIVA HQ (the brain), on Cloudflare

```
Browser / phone (PWA)         REST API / CLI / OpenClaw          Hourly cron
        │                              │                             │
        ▼                              ▼                             ▼
┌─────────────────────────── Cloudflare Worker (Astro) ───────────────────────────┐
│  Middleware: founder login (session cookie)   ·   /api/*: API_TOKEN bearer auth  │
│  Pages: /admin/hermes, /command, /junction, /cloud, /missions, /agents, /dump …  │
│  Services: agents · missions · knowledge · entities · dump · conversation · cloud │
└───────┬───────────────────┬──────────────────┬───────────────────┬──────────────┘
        │                   │                  │                   │
        ▼                   ▼                  ▼                   ▼
   D1 (admin-db)      R2 (tiva-hq-dump)   Workers AI          MISSION_WORKFLOW
   tables below       uploaded files      (dump reading)      (durable missions)
```

- **Auth.** Every dashboard page requires the Founder password (`FOUNDER_PASSWORD`)
  via a signed session cookie (`src/middleware.ts`, `src/lib/auth.ts`). Every
  `/api/*` route requires `Authorization: Bearer <API_TOKEN>` (`src/lib/api.ts`).
- **Data (D1).** `agents`, `entities`, `knowledge`, `missions`, `tasks`,
  `routines`, `activity`, `conversation_messages`, `dump_files`/`dump_chunks`
  (FTS), and `cloud_runs` (migrations `0001`–`0007`).
- **Model calls.** `src/lib/agents/llm.ts` calls Claude with structured outputs
  and prompt caching, with server-side refusal fallbacks on the Opus/Fable
  families. Model id from `AGENT_MODEL` (default `claude-opus-5`).

## Layer 2 — how a mission runs

```
Directive ─▶ Hermes plans ─▶ 1–6 assignments (dependency graph)
                                   │
                    ┌──────────────┼───────────────┐
                    ▼              ▼               ▼
                 Atlas          Ledger           Aegis      (executives, in parallel)
                    └──────────────┼───────────────┘
                                   ▼
                        Hermes writes the brief ─▶ Founder (outcome, results, decisions)
```

Each mission is a Cloudflare **Workflow** (`src/workflows/mission_workflow.ts`):
every step is durable and retried with backoff; independent assignments run in
parallel, dependent ones wait, failures are recorded and dependents skipped with
a reason. The hourly **cron** (`scheduler.ts`) launches due routines.

## Layer 3 — TIVA Cloud (reach outside agents)

- **Manus** — driven from HQ over its API (`src/lib/agents/manus.ts`): create a
  task, poll status, store it in `cloud_runs`. Dispatch shared by the API,
  the `/admin/cloud` page and Hermes (`src/lib/agents/cloud.ts`).
- **Skill-connected agents** — Claude Code, Codex, OpenClaw, Hermes Agent,
  Gemini, Copilot run on their own surfaces and call back into HQ through the
  `tiva-agent-team` skill (`integrations/agent-skills/tiva-agent-team`).
- **API** — `POST /api/agents/cloud`, `GET /api/agents/cloud/:id`.

## Layer 4 — the master junction (monitoring)

`/admin/junction` polls `GET /api/status` and shows every connector's live
**active / not-active** status, grouped: Your team · Cloud agents · Devices & MCP ·
Social & messaging · Cloud accounts · Self-hosted tools. Status is computed from
configuration (`src/lib/agents/connectors.ts`, `health.ts`) — a connector turns
active when its key/secret is set on the Worker.

## Layer 5 — MCP (the team as tools)

```
Claude Desktop / Cursor / Claude Code
        │  (stdio, JSON-RPC)
        ▼
  node integrations/mcp/tiva-mcp.mjs  ──HTTP──▶  TIVA HQ REST API
   tools: tiva_brief, tiva_start_mission, tiva_mission_status,
          tiva_remember, tiva_cloud_dispatch, tiva_agents, tiva_entities
```

The desktop setup also wires these MCP servers into the same clients:
**GitHub** (official hosted, via `mcp-remote`), **Web browser** (Playwright MCP),
**Filesystem**, and **Desktop Commander** (Windows terminal/file/process control).

## Layer 6 — the desktop (Windows workstation)

`ops/desktop/tiva-monster-setup.ps1` turns a Windows machine into a launch-ready
TIVA workstation: installs the agent CLIs + **GitHub Copilot**, saves the HQ
connection, installs the skill into every agent, wires the TIVA + GitHub +
browser + filesystem + desktop MCP servers, optionally starts the self-hosted
stack, adds shortcuts, and prints a health table. The workstation itself is built
by `ops/founder-workstation` (Azure) with the vault in `ops/oracle-vault` (Oracle),
reachable privately over Tailscale.

## Layer 7 — self-hosted tools

`ops/self-hosted/docker-compose.yml` runs Excalidraw, Memos, NocoDB, PocketBase,
Appsmith, Hoppscotch, Docmost and DeerFlow on the workstation, behind an optional
Caddy proxy. Set `TOOLS_BASE_URL` on the Worker and the junction links to them.

## The trust boundaries (what can do what)

| Boundary | Enforced by |
| --- | --- |
| Dashboard pages | Founder password → signed session cookie |
| REST API + MCP | `API_TOKEN` bearer |
| Manus | `MANUS_API_KEY`, server-side only |
| Agents on other surfaces | the skill + `TIVA_HQ_TOKEN` in their environment |
| Secrets | Cloudflare Worker secrets / the user's OS env — never committed |

The agents plan, research, draft and decide; they don't touch email, payments or
consoles on their own. Outward actions happen only through tools the Founder
connects (OpenClaw, the MCP servers, the desktop), each behind its own key.

## Where each piece lives

| Piece | Path |
| --- | --- |
| Worker pages / API | `src/pages` |
| Agent logic (LLM, orchestrator, cloud, manus, connectors, health) | `src/lib/agents` |
| Services (D1) | `src/lib/services` |
| Workflows + cron | `src/workflows` |
| Migrations | `migrations` |
| Team skill | `integrations/agent-skills/tiva-agent-team` |
| MCP server | `integrations/mcp` |
| Desktop setup | `ops/desktop` |
| Self-hosted tools | `ops/self-hosted` |
| Docs | `docs/AGENT_TEAM.md`, `docs/TIVA_CLOUD.md`, `docs/DESKTOP.md`, this file |
