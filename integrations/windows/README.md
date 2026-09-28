# TIVA Bible for Windows

One PowerShell run sets up the Founder's Windows PC for the TIVA AI agents, then cleans, repairs and organizes it. It writes `%USERPROFILE%\TIVA\BIBLE.md`, one page with everything set up so far.

## Run it

Open PowerShell (a normal window, not "Run as administrator") and paste:

```powershell
irm https://raw.githubusercontent.com/dhanushanchan-hub/saas-admin-template/main/integrations/windows/tiva-bible.ps1 -OutFile $env:TEMP\tiva-bible.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\tiva-bible.ps1
```

It asks for the TIVA HQ API token (Enter skips it), then Windows asks once for admin rights. After that it runs on its own for 30 to 90 minutes.

| Part | What it does |
| --- | --- |
| Admin (one approval) | Restore point. Git, GitHub CLI and Node.js LTS through winget. Windows temp files older than 2 days, error reports, crash dumps, Delivery Optimization and DNS caches, superseded Windows components. Broken Public desktop and All Users Start menu shortcuts to quarantine. DISM RestoreHealth, SFC, read-only disk scan. Defender update and quick scan. `winget upgrade --all`. |
| Yours | Your temp files and crash dumps older than 2 days. uv, Claude Code, Kimi Code and OpenClaw from their official installers. This repo in `~\TIVA`, SkillSpector, the repo's skills in `~\.agents\skills` for Kimi Code and OpenClaw. Claude Code and Kimi Code connected to OpenClaw over MCP. The TIVA agent team skill for OpenClaw when you give the token. Loose Desktop and Downloads files sorted into `Sorted\<type>`. Your broken shortcuts to quarantine. `BIBLE.md` and desktop launchers. |

## Safety

- Nothing personal is deleted. Files and shortcuts are moved, and every move is logged in `~\TIVA\logs\moves-*.csv`.
- `-Undo` moves them all back. `-Preview` shows what would move and changes nothing.
- The Recycle Bin is emptied only with `-EmptyRecycleBin`.
- Folders, shortcuts, hidden files, partial downloads and anything changed in the last 10 minutes stay where they are.
- The script keeps a copy of itself in `~\TIVA\tiva-bible.ps1` for undo and later runs.

```powershell
powershell -ExecutionPolicy Bypass -File $HOME\TIVA\tiva-bible.ps1 -Preview
powershell -ExecutionPolicy Bypass -File $HOME\TIVA\tiva-bible.ps1 -Undo
```

Other options: `-SkipInstall`, `-SkipClean`, `-SkipRepair`, `-SkipUpdates`, `-SkipOrganize`.

## After the run

1. Desktop, Claude Code (TIVA): sign in.
2. Desktop, Kimi Code (TIVA): type `/login`.
3. A normal PowerShell window: `openclaw onboard --install-daemon`.
4. Optional: `gh auth login`.
5. Restart the PC to finish repairs and updates.

The script needs Windows 10 1809 or later with winget ("App Installer"). OpenClaw's own docs call its native Windows install less tested than WSL2; the repo's [OpenClaw guide](../openclaw-windows/README.md) covers keeping that machine safe.
