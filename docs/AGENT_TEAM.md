# TIVA autonomous agent team

TIVA HQ runs an executive team of Claude-powered agents for the Founder of a multi-entity group. You give a directive once. Hermes, your Chief of Staff, plans it and routes it to the right executives, who work in parallel. You get back one brief with the decisions only you can make. The team also runs recurring routines around the clock, and every agent learns from what you teach it and from the team's past missions.

## The team

| Agent | Role | Reports to |
| --- | --- | --- |
| **Hermes** | Chief of Staff and 24/7 personal assistant. Plans every mission and writes every brief. | Founder |
| **Atlas** | Chief Technology Officer | Founder |
| Forge | Principal Engineer, Platform & Delivery | Atlas |
| Sentinel | Head of Security & Reliability | Atlas |
| Nova | Head of Data & AI | Atlas |
| **Muse** | Chief Product Officer | Founder |
| **Ledger** | Chief Financial Officer (multi-entity finance, tax, statutory calendars) | Founder |
| **Aegis** | General Counsel & Compliance | Founder |
| **Orbit** | Chief Operating Officer | Founder |
| **Echo** | Chief Marketing Officer | Founder |
| **Apex** | Chief Revenue Officer | Founder |
| Harbor | Head of Customer Success & Support | Apex |
| **Pulse** | Chief People Officer | Founder |
| **Prism** | Chief Strategy & Intelligence Officer | Founder |

Each agent has a charter, its standing brief. You can rewrite a charter from the agent's page ("Train"), pause any agent except Hermes, and give an agent its own model.

## How a mission runs

```
Directive (dashboard, API, OpenClaw, routine)
   │
   ▼
Hermes plans ──▶ 1–6 assignments, each owned by one agent, with dependencies
   │
   ▼
Executives work: independent assignments run in parallel; dependent ones get their teammates' output
   │
   ▼
Hermes writes the brief ──▶ outcome, key results, next actions, decisions for the Founder
```

Each mission is a [Cloudflare Workflow](https://developers.cloudflare.com/workflows/) (`src/workflows/mission_workflow.ts`), so every step is durable and retried with backoff. A mission survives deploys and restarts. When an assignment fails, the assignments that depend on it are skipped with a reason, and Hermes still briefs you on the rest.

## Memory and training

Every agent's context includes:

1. **The group structure**: the parent holding company, category holding companies and every business beneath them (`/admin/entities`).
2. **Your knowledge** (`/admin/knowledge`, or "Tell Hermes to remember" on the Command Center). An entry can apply to every agent, to one department, to missions for one entity, or to one agent. Hermes sees all of it.
3. **Team learnings**: after each assignment an agent can record durable lessons, shared with its department or with the whole team. They carry into later missions. You can delete any that are wrong.

The migration seeds your day-one vision and your operating setup, so the team plans against them from the first mission.

## The dump: everything you know, searchable

`/admin/dump` takes anything you throw at it. Drop in any number of files at once, or paste text:

| What you drop in | What happens |
| --- | --- |
| Text, Markdown, CSV, JSON, logs, subtitles | Read directly |
| PDF, Word, Excel, OpenDocument, HTML, XML | Converted to text by [Workers AI Markdown conversion](https://developers.cloudflare.com/workers-ai/features/markdown-conversion/) |
| Photos and screenshots | Described in words by a Workers AI vision model |
| Voice notes (mp3, m4a, wav, ogg and more, up to 10 MB) | Transcribed by Whisper on Workers AI |
| Video, and any file over 25 MB | Stored, not read |

Originals go to the `tiva-hq-dump` R2 bucket (binding `DUMP`). The text is split into chunks and full-text indexed in D1 (`dump_files`, `dump_chunks`). Before Hermes answers a chat, plans a mission, or an agent works an assignment, it searches the dump for what matters and gets the best matching excerpts in its prompt. Open any file to see the text that was read, download the original, or delete it.

Uploads are capped at 100 MB per file by Cloudflare. Images and voice notes use Workers AI, which has a free daily allowance before usage is billed. Don't put other people's identity documents (Aadhaar, PAN) here; those belong in the KYC vault.

## 24/7 routines

An hourly cron trigger (`wrangler.jsonc`) launches a mission for each routine that's due:

| Routine | Lead | Default schedule (UTC) |
| --- | --- | --- |
| Founder daily brief | Hermes | Daily 02:00 |
| Daily technology review | Atlas | Daily 03:00 |
| Weekly finance & compliance check | Ledger | Mondays 03:00 |
| Weekly market intelligence memo | Prism | Mondays 04:00 |
| Weekly operating review | Orbit | Fridays 12:00 |

Change the schedules, pause routines or run them now from `/admin/routines`. If a cron tick is missed, the routine runs on the next one.

## What the team can and can't do

The agents plan, research, analyse, draft and decide. They have no access to email, payments, cloud consoles or your VMs, so nothing is sent, paid, signed or deployed without you. The team only knows what's in the knowledge base, the directive and its teammates' work. Agents are told to list unknown facts as assumptions for you to confirm rather than invent them. To act on the team's output, use OpenClaw on your desktop, n8n or your own hands.

## Setup

1. Create the R2 bucket for the dump (`npx wrangler r2 bucket create tiva-hq-dump`), then apply the migrations: `npm run db:migrate` (local) or `npm run db:migrate:remote`.
2. Add secrets:
   ```bash
   npx wrangler secret put FOUNDER_PASSWORD
   npx wrangler secret put API_TOKEN
   npx wrangler secret put ANTHROPIC_API_KEY
   ```
   For local development, put them in `.dev.vars` (see `.dev.vars.example`).
3. Optional settings in `wrangler.jsonc` → `vars`:
   - `COMPANY_NAME` (default `TIVA`)
   - `AGENT_MODEL` (default `claude-opus-5`). Agents call Claude with structured outputs and prompt caching. On the Opus 5 and Fable 5 families they use server-side refusal fallbacks (`fallbacks: "default"`).
   - `ANTHROPIC_BASE_URL`, for routing through Cloudflare AI Gateway.
4. Deploy: `npm run deploy`. The cron trigger and the mission workflow deploy with the Worker. Cloudflare only creates a new Workflow on a real deploy, so preview builds of branches can't start missions until this has been deployed from `main` once.

## Sign-in

Every page needs the Founder's password, the `FOUNDER_PASSWORD` secret (at least 16 characters). Until it is set, the dashboard stays locked and `/login` explains how to set it. A sign-in lasts 30 days on that device. Changing the password signs out every device. `src/middleware.ts` enforces it and `src/lib/auth.ts` signs the session cookie.

The REST API doesn't use the login: every `/api/*` route still requires `Authorization: Bearer <API_TOKEN>`, so OpenClaw, n8n and the CLI keep working. Signed-in pages embed the API token for their own API calls, so only share the password with people you'd give the token to.

For a second layer, put the Worker, including its `workers.dev` and preview URLs, behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/). Machine clients then also need an Access service token.

## Talking to Hermes (chat and voice)

`/admin/hermes` is a running conversation with Hermes, and it's where the installed app opens. Hermes answers from memory, recent missions and the latest briefs. When you ask for real work, Hermes starts a mission and links it. When you tell it something lasting, it saves that to the team's memory. The conversation is stored, so Hermes remembers it on later turns.

- **Voice in:** tap the mic to speak (Chrome, Edge and Safari, using the browser's speech recognition). The button hides where the browser doesn't support it; on iPhone, the keyboard's dictation key always works.
- **Voice out:** the speaker button reads Hermes's replies aloud with the device's built-in voices.

## Install it as an app

TIVA HQ is an installable web app (a PWA), so the same dashboard runs as an app on every device, with no app store:

- **Windows desktop (the Azure VM) or Mac:** open TIVA HQ in Edge or Chrome, then choose *Install TIVA HQ* from the address bar or the menu. It gets its own window, taskbar icon and Start menu entry.
- **iPhone / iPad:** open it in Safari, tap *Share*, then *Add to Home Screen*.

The app opens on Hermes, with shortcuts to the Command Center and Missions. The service worker (`public/sw.js`) caches only the fingerprinted build assets. Pages and API data always come live from the network.

## Talking to the team from anywhere

- **Dashboard**: `/admin/hermes` (conversation), `/admin/command` (directives, decisions, memory, activity), plus Missions, Agents, Knowledge, Routines and Group Structure.
- **REST API**: `POST /api/hermes/chat`, `POST /api/missions`, `GET /api/missions/:id`, `GET /api/briefing`, `POST /api/knowledge` and the rest, documented on `/admin`. Send `Authorization: Bearer <API_TOKEN>` and `Content-Type: application/json`.
- **OpenClaw, Hermes Agent, Claude Code**: install the `integrations/agent-skills/tiva-agent-team` skill. For the Azure Windows desktop, `integrations/openclaw-windows/setup-openclaw.ps1` does it in one step; see [its guide](../integrations/openclaw-windows/README.md).
- **Terminal or n8n**: `node integrations/agent-skills/tiva-agent-team/scripts/tiva.mjs brief`.
