# Notes for AI agents working on TIVA

## Who you are working for
Dhanush Anchan, founder of the TIVA Family Holding Company in Mangalore, Karnataka.
- **How to talk to him:** he is not technical. Use short, plain sentences, say what you are about to do, and show proof: command output or a screenshot. Never say something is done without checking it.
- **The companies:**
  - Tiva World Foundation (Section 8, NGO Darpan);
  - Tiva Beverages Pvt Ltd (GST, bank account);
  - TIVA Enterprises;
  - TIVA Technology.

## What is in this repository
- **TIVA HQ:** the founder's command centre, built with Astro and Cloudflare Workers (`src/`, `migrations/`, `wrangler.jsonc`).
  - It is live at https://saas-admin-template.dhanush-anchan.workers.dev.
  - It uses the D1 database `admin-db`, the R2 bucket `tiva-hq-dump`, Workers AI, Workflows and an hourly cron.
  - Merging to `main` deploys it through Cloudflare Workers Builds.
- **The agent team inside TIVA HQ:** `docs/AGENT_TEAM.md` explains how Hermes and the 13 other agents work.
- **`ops/founder-workstation/`:** creates the founder's Azure Windows workstation and its desktop setup. `AGENT-TASK.md` there is the step-by-step job.
- **`ops/oracle-vault/`:** installer for the document vault on the Oracle Ubuntu computer.
- **Ready-to-paste jobs:** `ops/AIR-START.md`.

## Commands
- `npm install`, then `npm run check` (build plus `wrangler deploy --dry-run`) before any push that touches the app.
- Don't run `wrangler deploy` yourself. Merging to `main` deploys.

## Rules
- **Existing cloud resources:** never delete, stop, resize or change anything in Azure, Oracle, AWS or Cloudflare unless he says yes to that exact action. His existing data may contain mistakes, and he wants it kept as it is.
- **Costs:** show the price in rupees for anything that costs money, and wait for his YES.
- **Secrets:** never put passwords, API keys or Tailscale keys in files, commits, pull requests or logs.
- **Network exposure:** never open Remote Desktop, SSH, VNC or any other port to the whole internet.
- **Git:** work on a branch and open a pull request. Don't push to `main`.
