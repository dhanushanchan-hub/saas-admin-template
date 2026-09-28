# TIVA desktop — the monster setup

One PowerShell script, [`tiva-monster-setup.ps1`](tiva-monster-setup.ps1), that turns
a Windows desktop into an autonomous, launch-ready TIVA workstation. Run it once
from a clone of this repo, as the user who'll use the machine. It's idempotent —
re-run it any time; it only installs what's missing and never deletes your data.

## What it wires up

| Chapter | What it does |
| --- | --- |
| 1. Base tools | Git, GitHub CLI, Node LTS, Python, uv, Tailscale (Docker & VS Code optional) |
| 2. Agents | Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw, Hermes Agent, Wrangler |
| 3. Connection | Saves `TIVA_HQ_URL` + `TIVA_HQ_TOKEN` as user environment variables |
| 4. Skill | Installs the `tiva-agent-team` skill into every agent |
| 5. MCP | Wires Claude Desktop, Cursor and Claude Code to the bundled TIVA MCP server |
| 6. Tools | Optionally brings up the self-hosted stack (`-StartTools`, needs Docker) |
| 7. Shortcuts | Desktop links to the Junction, Hermes and Cloud pages |
| 8. Health | Verifies every tool and prints a launch-ready status table |

## Run it

Open PowerShell (normal, non-admin is fine for most of it), in the repo:

```powershell
cd ops\desktop
.\tiva-monster-setup.ps1 -HqUrl https://your-worker.workers.dev -HqToken (Read-Host "API token")
```

Everything at once, including Docker and the self-hosted tools:

```powershell
.\tiva-monster-setup.ps1 -HqUrl https://your-worker.workers.dev -HqToken $t -InstallDocker -StartTools
```

If PowerShell blocks the script, allow it for this session first:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Options

| Flag | Effect |
| --- | --- |
| `-AccessClientId` / `-AccessClientSecret` | Cloudflare Access service token, if HQ is behind Access |
| `-SkipTools` | Don't install base tools or agents (just wire connection, skill, MCP) |
| `-SkipHermes` | Skip Hermes Agent |
| `-SkipMcp` | Don't touch MCP client configs |
| `-SkipShortcuts` | Don't create desktop shortcuts |
| `-InstallDocker` | Install Docker Desktop (needs admin + reboot the first time) |
| `-InstallVSCode` | Install VS Code |
| `-StartTools` | `docker compose up -d` the self-hosted stack in `../self-hosted` |

## After it runs

1. Open a **new** terminal so the new PATH and environment variables load.
2. Restart Claude Desktop / Cursor so they pick up the TIVA MCP server.
3. Open `https://your-worker.workers.dev/admin/junction`.
4. Ask any agent, or Claude Desktop: *"What's my brief?"*

## Notes

- **Safe to re-run.** Each step checks first; nothing is deleted.
- **Secrets** are saved only as your Windows user environment variables and in the
  MCP client configs on this machine — never committed.
- **Docker Desktop** is the one part that needs administrator and a reboot.
- A full log is written to `%TEMP%\tiva-monster-setup-*.log`.
- This runs on the Windows desktop, not on Cloudflare. It connects the desktop to
  TIVA HQ, which is what's deployed from this repo.
