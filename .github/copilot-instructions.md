# Copilot instructions for TIVA HQ

Repo-level guidance for GitHub Copilot (Chat, completions and the coding agent)
when working in this repository. Keep suggestions consistent with what's here.

## What this project is

TIVA HQ is a Cloudflare Worker built with **Astro** that runs the Founder's
autonomous executive team of Claude agents, plus **TIVA Cloud** (connectors to
outside agent platforms) and a **master junction** monitoring dashboard. See
`docs/ARCHITECTURE.md` for the full system, and `docs/AGENT_TEAM.md` /
`docs/TIVA_CLOUD.md` for the features.

## Stack and conventions

- **Runtime:** Cloudflare Workers (via `@astrojs/cloudflare`), D1 (SQLite), R2,
  Workers AI, Cloudflare Workflows, an hourly cron. Node 22+.
- **Language:** TypeScript. Match the surrounding code's style — the existing API
  routes use untyped destructured handler params (`{ locals, request }`); follow
  that local idiom rather than introducing a different pattern in one file.
- **Validation:** request bodies are validated with **zod** (`src/lib/agents/http.ts`
  helpers `invalid`, `readJson`, `unauthorized`). Reuse them.
- **Data access:** go through the service classes in `src/lib/services/*`
  (e.g. `MissionService`, `CloudRunService`); don't write raw D1 queries in routes.
- **Auth:** dashboard pages require the Founder session (`src/middleware.ts`,
  `src/lib/auth.ts`); every `/api/*` route calls `unauthorized(locals, request)`
  first (checks `API_TOKEN`). New API routes must do the same.
- **Agent model calls:** go through `src/lib/agents/llm.ts` (`callAgent`), which
  handles structured outputs, caching and refusal fallbacks. Default model comes
  from `AGENT_MODEL` (`claude-opus-5`); don't hardcode a different model.
- **Migrations:** add a new numbered file in `migrations/` (next is `0008_*`);
  never edit an applied migration.

## House rules (do not break these)

- Put work on a branch and open a **draft PR**; never suggest committing to
  `main` or force-pushing.
- **Never** put secrets, API keys or tokens in code, comments or committed files.
  Secrets are Cloudflare Worker secrets or the user's OS environment.
- **No model identifier** in commit messages, PR titles/bodies or code comments.
- Keep changes minimal and in keeping with the file you're editing.
- Build check: `npm run build`. The repo has pre-existing `tsc` noise, so don't
  treat a clean `tsc` as the gate — `npm run build` and `wrangler deploy --dry-run`
  are the real checks.

## Where things live

`src/pages` (routes & pages) · `src/lib/agents` (LLM, orchestrator, cloud, manus,
connectors, health) · `src/lib/services` (D1) · `src/workflows` (missions + cron) ·
`migrations` · `integrations/` (team skill, MCP server) · `ops/` (desktop setup,
self-hosted stack).
