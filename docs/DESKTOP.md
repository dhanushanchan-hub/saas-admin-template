# Connect your whole desktop to TIVA

One page to wire every agent, tool and account to your executive team. Work top
to bottom; each part stands on its own, so do the ones you want.

Everything points at two things you'll paste in a few times:

- **TIVA HQ URL** — your Worker's address, e.g. `https://tiva-hq.<you>.workers.dev`
- **API token** — the `API_TOKEN` secret on the Worker (also shown on `/admin/cloud`)

The master view of all of this is **`/admin/junction`** — open it any time to see
what's connected and what still needs a key.

---

## 1. The team itself (already cloud-hosted)

TIVA HQ runs on Cloudflare: Hermes, the 14 executives, the dump, and 24/7
routines. Talk to it at `/admin/hermes`, or install it as an app (Edge/Chrome →
*Install*, or iPhone Safari → *Add to Home Screen*). Nothing to install on the
desktop for this.

## 2. Manus (deep research, driven from TIVA HQ)

1. Get a Manus API key from your Manus account.
2. `npx wrangler secret put MANUS_API_KEY` on the Worker.
3. Open `/admin/cloud`, send a task to Manus, and watch it there. Hermes can also
   hand it work when you say "use Manus".

## 3. The coding and assistant agents

Each runs on its own surface and reaches your team through the `tiva-agent-team`
skill. Install the agent, drop the skill in, set the two env values.

| Agent | Install | Skill goes in |
| --- | --- | --- |
| Claude Code (web) | claude.ai/code — connect your GitHub repo | repo, or `~/.claude/skills` |
| Codex CLI | `npm i -g @openai/codex` | `~/.codex/skills` |
| Gemini CLI | `npm i -g @google/gemini-cli` | project / env |
| OpenClaw | `integrations/openclaw-windows/setup-openclaw.ps1` | done for you |
| Hermes Agent | hermes-agent.nousresearch.com | `~/.hermes/skills` |

The skill lives at `integrations/agent-skills/tiva-agent-team`. Set these two
values in the agent's environment:

```
TIVA_HQ_URL=https://your-worker.workers.dev
TIVA_HQ_TOKEN=your-api-token
```

**Kimi (Moonshot):** to use Kimi as the model behind OpenClaw or Hermes Agent,
set your Kimi/Moonshot API key in that agent's provider settings. Set
`KIMI_API_KEY` on the Worker too and the junction shows it as connected.

## 4. MCP — the team as tools in Claude Desktop / Cursor

Add the bundled MCP server so any MCP client gets the team as tools
(`tiva_brief`, `tiva_start_mission`, `tiva_cloud_dispatch`, …). Full steps and
config in [`../integrations/mcp/README.md`](../integrations/mcp/README.md). Short
version for Claude Desktop:

```json
{
  "mcpServers": {
    "tiva-hq": {
      "command": "node",
      "args": ["/absolute/path/to/integrations/mcp/tiva-mcp.mjs"],
      "env": {
        "TIVA_HQ_URL": "https://your-worker.workers.dev",
        "TIVA_HQ_TOKEN": "your-api-token"
      }
    }
  }
}
```

**Canva:** connect Canva's own MCP connector in your Claude client to create and
edit designs from chat.

## 5. Your workstation (Azure) and document vault (Oracle)

The always-on Windows workstation, with all the agents and CLIs pre-installed, is
built by the scripts in [`../ops/founder-workstation`](../ops/founder-workstation).
The Oracle document vault is in [`../ops/oracle-vault`](../ops/oracle-vault). Reach
both privately over Tailscale — nothing is opened to the public internet.

## 6. Your own tools (Excalidraw, Memos, NocoDB, and more)

Eight self-hosted tools come up with one command on the workstation. See
[`../ops/self-hosted/README.md`](../ops/self-hosted/README.md):

```bash
cd ops/self-hosted && cp .env.example .env   # set the secrets
docker compose up -d
```

Set `TOOLS_BASE_URL` on the Worker (your workstation's Tailscale address) and the
junction links straight to each tool.

---

Once wired, `/admin/junction` is your main junction — every agent, connector,
account and tool in one place, each showing whether it's live.
