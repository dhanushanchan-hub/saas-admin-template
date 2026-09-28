# Claude Code toolkit

Five open-source tools that make Claude Code better at working on TIVA HQ. They live in this repo's `.claude/` folder as plain files, so they load in every Claude Code session on this repo: the Claude app, claude.ai/code, the desktop app and the terminal. There is nothing to install per session.

| Tool | What it gives Claude | How you use it | Upstream |
| --- | --- | --- | --- |
| **SkillSpector** (NVIDIA) | A security scanner for agent skills: prompt injection, data theft, credential access and supply-chain risk, checked before a skill is trusted | Ask "is this skill safe?" (the `skill-inspector` skill). A GitHub check also scans every pull request that touches `.claude/` | [NVIDIA/skillspector](https://github.com/NVIDIA/skillspector) |
| **Reticle** | Lets Claude check the running app from the inside (page, network, console, framework state) and name the file and line to fix | Ask Claude to verify a change, or type `/reticle` | [reticlehq/reticle](https://github.com/reticlehq/reticle) |
| **Chisle** | Cuts token use: short replies, "least code that works" decisions, and trimmed tool output | Always on. `/chisle-review` and `/chisle-audit` review a diff or a codebase for bloat | [JayPokale/Chisle](https://github.com/JayPokale/Chisle) |
| **UI Skills** | Rules for better interfaces: spacing, typography, states, accessibility, motion, page metadata | `/baseline-ui`, `/improve-ui`, `/fixing-accessibility`, `/fixing-motion-performance`, `/fixing-metadata`, `/create-design-md` | [ibelick/ui-skills](https://github.com/ibelick/ui-skills) |
| **Anti-Slop** | Filters generic "AI slop" out of UI, copy and code comments: 38 rules and a delivery check | `/antislop`, plus `antislop-ui`, `-copywriting`, `-human`, `-layoutmobile` and `-code` | [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) |

You rarely need the slash commands. Claude picks a skill up by itself when the task matches, for example UI Skills and Anti-Slop when you ask it to build or polish a page.

## What runs on its own

- **Chisle** runs three hooks: at session start (loads its rules), on each prompt (a one-line reminder) and after tool calls (long outputs keep their start, end and error lines; the full text is saved under `~/.claude/chisle-spill/`). Say "stop chisle" or "normal mode" for full-length answers in a session, and `/chisle` to switch it back on. To turn it off for good, set `CHISLE_DEFAULT_MODE=off`, on your machine or as a variable on the cloud environment. `CHISLE_COMPRESS=0` keeps the short replies but leaves tool output untouched.
- **SkillSpector** installs itself in the background when a cloud session starts (`.claude/hooks/toolkit-setup.mjs`).
- **Reticle**'s MCP server starts with each session, pinned to `@reticlehq/server@3.3.0`. It does nothing until the app runs with Reticle's SDK. The first time Claude verifies a change, the Reticle skill adds that dev-only SDK to the app and starts the dev server without asking, so look over that diff before merging it.
- **Anti-Slop** applies its rules while Claude builds (mode 1, set in `AGENTS.md`). Ask for an "antislop audit" to get a numbered findings list instead.

## Security review

Each tool was scanned with SkillSpector 2.12.0 before it was added. The first pass rated the Anti-Slop core skill and Chisle's hook scripts "do not install", so every finding was read against its source line. None is malicious. They are an example sentence ("announced without warning"), a skill naming its own sibling skills, `npx` commands without a pinned version, and two comments in Chisle's statusline script, one naming `~/.ssh/id_rsa` while explaining a guard against reading it. That script isn't included. Each accepted finding and its reason is in `.claude/toolkit/skillspector-baseline.yaml`. The SkillSpector GitHub check fails any pull request that brings in a finding that isn't reviewed there.

Two tradeoffs are worth knowing: Reticle sets itself up without asking (above), and Chisle rewrites long tool output before Claude reads it.

Licences: SkillSpector and the Reticle skill are Apache-2.0; Chisle, UI Skills and Anti-Slop are MIT. Copies are in `.claude/toolkit/licenses/`. Reticle's server, which runs through `npx` and isn't copied here, is source-available under FSL-1.1 and free for internal use and development.

## Updating

The upstream commits are pinned in `.claude/toolkit/sources.json`. To move to the newest versions:

```bash
node .claude/toolkit/sync.mjs --latest
skillspector scan .claude/skills --no-llm --baseline .claude/toolkit/skillspector-baseline.yaml --fail-on-findings
skillspector scan .claude/hooks --no-llm --baseline .claude/toolkit/skillspector-baseline.yaml --fail-on-findings
```

Read any new finding in the file it names. Add a rule with the reason only if it's safe, then commit. Or ask Claude to "update the Claude Code toolkit" and review its pull request. Without `--latest`, `sync.mjs` restores the pinned versions and undoes hand edits.

## On your own computer

On Windows, one script installs Claude Code, Kimi Code and OpenClaw, shares these skills with all three, and cleans up the PC: [integrations/windows](../integrations/windows/README.md).

Open the repo in Claude Code, trust the folder, and approve the `reticle` MCP server when asked. Node 22 or later (the app needs it anyway) runs the Chisle hooks. For SkillSpector scans, install its CLI once with [uv](https://docs.astral.sh/uv/), using the `ref` from `sources.json`:

```bash
uv tool install --python 3.12 "git+https://github.com/NVIDIA/skillspector@<ref>"
```

Don't also install these tools as plugins (`/plugin install reticle@reticlehq` and similar) in this repo, or Claude sees every skill twice. Cloud sessions never install plugins declared in a repo's settings, which is why the files live here instead.

## GitHub and web search

- **GitHub**: cloud sessions work through the Claude GitHub App. Claude clones the repo, pushes branches, opens pull requests and follows their checks and review comments. To add more repositories, install the app on them at [claude.ai/connect-github](https://claude.ai/connect-github).
- **Web search** is built in and pre-approved in `.claude/settings.json`. Which sites Claude can then open in a cloud session depends on the environment's network access level. The default "Trusted" level blocks many sites. To widen it, open the environment menu in a session's title bar, choose **Edit**, and change **Network access** or add domains.

## Not included

- Reticle's 13 task recipes (`npx skills add reticlehq/reticle`). The main Reticle skill covers setup and verification.
- Anti-Slop's contrast MCP server. The `antislop-human` skill runs the same check with its `contrast-check.py` script.
- Chisle's statusline badge. Cloud sessions have no status bar.
