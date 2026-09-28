# TIVA HQ MCP server

Reach your executive team and cloud agents from any MCP client — Claude Desktop,
Claude Code, Cursor. It's a small, zero-dependency bridge over the TIVA HQ API,
so once it's added, the client gets these tools:

| Tool | What it does |
| --- | --- |
| `tiva_brief` | The Founder's briefing: missions in flight, latest briefs, open decisions |
| `tiva_start_mission` | Give the team a directive |
| `tiva_mission_status` | A mission's plan, deliverables, brief and decisions |
| `tiva_remember` | Teach the team a lasting fact, goal or preference |
| `tiva_cloud_dispatch` | Hand a task to Manus (or log a handoff to another platform) |
| `tiva_agents` | List the executive team |
| `tiva_entities` | List the group structure |

## What you need

- **Node 18+** on the machine running the MCP client.
- Your **TIVA HQ URL** and **API token** (the `API_TOKEN` secret on the Worker).

No install step — the client launches `tiva-mcp.mjs` with `node`.

## Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add:

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

Restart Claude Desktop. You'll see the TIVA tools in the tools menu.

## Claude Code / Cursor (`.mcp.json`)

Put this at the root of a project (Claude Code and Cursor both read `.mcp.json`):

```json
{
  "mcpServers": {
    "tiva-hq": {
      "command": "node",
      "args": ["integrations/mcp/tiva-mcp.mjs"],
      "env": {
        "TIVA_HQ_URL": "https://your-worker.workers.dev",
        "TIVA_HQ_TOKEN": "your-api-token"
      }
    }
  }
}
```

Or add it from the Claude Code CLI:

```bash
claude mcp add tiva-hq \
  --env TIVA_HQ_URL=https://your-worker.workers.dev \
  --env TIVA_HQ_TOKEN=your-api-token \
  -- node integrations/mcp/tiva-mcp.mjs
```

## Behind Cloudflare Access

If TIVA HQ is behind Cloudflare Access, also pass an Access service token in `env`:

```json
"env": {
  "TIVA_HQ_URL": "https://your-worker.workers.dev",
  "TIVA_HQ_TOKEN": "your-api-token",
  "TIVA_HQ_ACCESS_CLIENT_ID": "xxx.access",
  "TIVA_HQ_ACCESS_CLIENT_SECRET": "yyy"
}
```

## Test it yourself

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"t","version":"0"}}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  | TIVA_HQ_URL=https://your-worker.workers.dev TIVA_HQ_TOKEN=your-api-token \
    node tiva-mcp.mjs
```

You should see the server's capabilities and the list of tools.
