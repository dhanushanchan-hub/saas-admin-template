# TIVA Cloud

TIVA Cloud connects the Founder's executive team to outside agent platforms and
gives one master view of everything. It lives inside TIVA HQ (Cloudflare Workers),
so there's nothing new to host.

## The master junction (`/admin/junction`)

One monitoring dashboard for everything TIVA runs: the team, the cloud agents,
MCP connectors and devices, social platforms, cloud accounts (Cloudflare, Azure,
Oracle) and the self-hosted tools. Each shows whether it's **active** or needs a
key, with a green dot for active. The page auto-refreshes (polling `/api/status`)
and shows live counts — connectors active, missions in flight, briefs, cloud runs.

A connector turns **active** as soon as its key/secret is set on the Worker. Set
these (as secrets or `vars`) to light each one up:

| Connector | Env key(s) |
| --- | --- |
| Kimi | `KIMI_API_KEY` or `MOONSHOT_API_KEY` |
| Windows MCP / iOS MCP | `WINDOWS_MCP_URL` / `IOS_MCP_URL` |
| Canva | `CANVA_ACCESS_TOKEN` |
| X (Twitter) | `X_API_KEY` or `TWITTER_BEARER_TOKEN` |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN` |
| Instagram / Facebook / WhatsApp | `META_ACCESS_TOKEN` (or the per-app token) |
| YouTube | `YOUTUBE_API_KEY` or `GOOGLE_API_KEY` |
| TikTok | `TIKTOK_ACCESS_TOKEN` |
| Reddit | `REDDIT_CLIENT_ID` |
| Telegram | `TELEGRAM_BOT_TOKEN` |
| Azure / Oracle | `AZURE_SUBSCRIPTION_ID` / `ORACLE_TENANCY_OCID` |
| Self-hosted tools | `TOOLS_BASE_URL` (your workstation address) |

The status is read from configuration — a live snapshot of what's wired — not a
deep uptime probe of each third party (many run on private networks or need
per-account OAuth). `GET /api/status` returns the same snapshot as JSON for your
own uptime checks.

## The Cloud page (`/admin/cloud`)

Hand work to outside platforms and keep every run in one place.

- **Manus** is driven from TIVA HQ over its API. Pick a profile, send a task, and
  watch its status here. This is a real, working bridge.
- **Claude Code, Codex, OpenClaw, Hermes Agent, Gemini** run on their own hosted
  or desktop surfaces. The page gives copy-paste connection steps; once connected
  through the `tiva-agent-team` skill, they can reach the team.

## How Manus is wired

`src/lib/agents/manus.ts` is a small, defensive client for the Manus API. It is
configurable so it keeps working as Manus evolves:

| Setting | Default | Notes |
| --- | --- | --- |
| `MANUS_API_KEY` | — (secret) | Required to send tasks to Manus. |
| `MANUS_BASE_URL` | `https://api.manus.ai` | Override for a different endpoint. |
| `MANUS_API_KEY_HEADER` | `API_KEY` | Some accounts use `x-manus-api-key`. |
| `MANUS_AGENT_PROFILE` | `manus-1.6` | Default profile (`-lite` / `-max` too). |

> The exact Manus request/response shape can change and couldn't be pinned from
> the build environment, so the client sends both the v1 and v2 field names and
> reads the response defensively. If your account differs, set the vars above.
> Confirm the current fields at Manus's API docs.

Runs are stored in the `cloud_runs` table (migration `0007`) so the Founder and
Hermes see them alongside missions.

## Hermes can delegate to Manus

In chat, when the Founder explicitly asks to use Manus (or "the cloud agent") for
open-ended research or browsing, Hermes starts a Manus task and links it. If the
Founder doesn't name Manus, Hermes uses the in-house team instead.

## API

Behind `Authorization: Bearer <API_TOKEN>` (documented on `/admin`):

- `POST /api/agents/cloud` — hand a task to a platform. Body:
  `{ "platform": "manus", "prompt": "…", "profile": "manus-1.6" }`.
  Manus starts immediately (status 202); other platforms record a handoff.
- `GET /api/agents/cloud/:id` — one run; refreshes a Manus run's status first.
- `GET /api/agents/cloud` — recent runs.

Example:

```bash
curl -X POST https://your-worker.workers.dev/api/agents/cloud \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"manus","prompt":"Research our top 3 competitors and summarise their pricing."}'
```

## MCP

The team is also available to MCP clients (Claude Desktop, Claude Code, Cursor)
through the bundled server in [`../integrations/mcp`](../integrations/mcp).

## Setup

1. `npx wrangler secret put MANUS_API_KEY` (optional, for Manus).
2. `npm run db:migrate:remote` to create the `cloud_runs` table.
3. Optional vars in `wrangler.jsonc`: `MANUS_BASE_URL`, `MANUS_API_KEY_HEADER`,
   `MANUS_AGENT_PROFILE`, and `TOOLS_BASE_URL` (your workstation address, to link
   the self-hosted tools from the junction).
