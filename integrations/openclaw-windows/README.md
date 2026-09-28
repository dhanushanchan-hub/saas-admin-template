# OpenClaw on the Azure Windows desktop

This connects OpenClaw, running on the Founder's Azure Windows VM, to the TIVA HQ agent team. OpenClaw then takes over as the Founder's front door:

```
Founder (iPhone / RDP) ──▶ OpenClaw on the Azure desktop ──▶ tiva-agent-team skill ──▶ TIVA HQ API
                                                                                         │
                             OpenClaw dashboard  ◀── briefs, decisions ◀── Hermes + executive team
                             TIVA HQ Command Center (/admin/command)
```

- **TIVA HQ** (this repo, on Cloudflare) is the brain. Hermes plans, the executives work in parallel, and briefs, decisions and memory are stored in one place. It runs 24/7 whether or not the VM is on.
- **OpenClaw** is the hands on the desktop. It relays requests, reads back briefs, and carries out approved steps on that machine when the Founder asks.

## Setup

On the VM, clone this repository, then in PowerShell (not as Administrator):

```powershell
cd saas-admin-template\integrations\openclaw-windows
.\setup-openclaw.ps1 -HqUrl https://<your-worker>.workers.dev -HqToken (Read-Host "TIVA HQ API token")
```

The script installs OpenClaw with its official installer (skip that with `-SkipOpenClawInstall`) and installs the skill to `%USERPROFILE%\.agents\skills\tiva-agent-team`. It saves `TIVA_HQ_URL` and `TIVA_HQ_TOKEN` as user environment variables, then checks the connection. If TIVA HQ is behind Cloudflare Access, also pass `-AccessClientId` and `-AccessClientSecret`, a [service token](https://developers.cloudflare.com/cloudflare-one/identity/service-tokens/).

If you'd rather keep the token in OpenClaw's config than in environment variables, set it under `skills.entries.tiva-agent-team.env` in `openclaw.json`.

## Other assistants

The skill is a standard `SKILL.md`, so the same folder works elsewhere:

| Assistant | Copy `integrations/agent-skills/tiva-agent-team` to |
| --- | --- |
| OpenClaw | `~/.agents/skills/` or `<workspace>/skills/` |
| Hermes Agent (Nous Research) | `~/.hermes/skills/` |
| Claude Code | `.claude/skills/` in a project, or `~/.claude/skills/` |

n8n on the Oracle VM can call the same REST API with HTTP Request nodes, or run `node tiva.mjs ...` with an Execute Command node.

## Keep the VM safe

OpenClaw can drive the whole desktop, so treat the VM as a privileged machine:

- Don't expose RDP (3389) or WinRM (5985/5986) to the internet. Reach the VM over Tailscale, Azure Bastion, or just-in-time access.
- Run OpenClaw as a dedicated Windows user, not the built-in administrator.
- Keep `TIVA_HQ_TOKEN` in environment variables or Infisical, never in scripts or chat logs, and rotate it if it leaks: `npx wrangler secret put API_TOKEN`.
- Don't run anything that executes commands received from a webhook without checking them. The TIVA agent team deliberately produces plans and drafts rather than running commands.
