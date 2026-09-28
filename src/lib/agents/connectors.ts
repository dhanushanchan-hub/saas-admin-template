// The master junction: every platform, agent, connector and account TIVA HQ
// knows about, with a live status read from what's actually configured. Powers
// the /admin/junction dashboard — one place to see how everything is wired.

import { manusConfigured } from "./manus";
import type { AgentTeamEnv } from "./types";

export type ConnectorStatus =
  | "live" // TIVA HQ drives it right now
  | "connected" // configured / reachable
  | "configure" // one step away — a key or secret is missing
  | "external"; // runs on its own surface, connected through the skill/MCP

export type Connector = {
  id: string;
  name: string;
  detail: string;
  status: ConnectorStatus;
  // Where the Founder goes for it: an internal dashboard path or an external URL.
  href: string;
  external?: boolean;
};

export type ConnectorGroup = {
  id: string;
  title: string;
  description: string;
  connectors: Connector[];
};

export const STATUS_LABEL: Record<ConnectorStatus, string> = {
  live: "Live",
  connected: "Connected",
  configure: "Add key",
  external: "Connect",
};

// Reads an optional secret/var that isn't in the typed Env, without throwing.
const has = (env: AgentTeamEnv, ...keys: string[]) =>
  keys.some((key) => {
    const value = (env as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0;
  });

export const connectorGroups = (
  env: AgentTeamEnv,
  origin: string,
): ConnectorGroup[] => {
  const teamReady = has(env, "ANTHROPIC_API_KEY");
  const manus = manusConfigured(env);
  const skillReady = has(env, "API_TOKEN");
  const skillDetail = (name: string) =>
    skillReady
      ? `Runs on ${name}; reaches your team through the tiva-agent-team skill.`
      : `Set API_TOKEN so ${name} can reach your team through the skill.`;

  return [
    {
      id: "team",
      title: "Your team",
      description: "The executive team, always on, on Cloudflare.",
      connectors: [
        {
          id: "hq",
          name: "TIVA HQ",
          detail: teamReady
            ? "Hermes and the 14 executives are ready."
            : "Add ANTHROPIC_API_KEY so the team can run.",
          status: teamReady ? "live" : "configure",
          href: "/admin",
        },
        {
          id: "hermes",
          name: "Hermes",
          detail: "Chat or voice with your Chief of Staff.",
          status: "live",
          href: "/admin/hermes",
        },
        {
          id: "routines",
          name: "24/7 routines",
          detail: "Daily and weekly missions run around the clock.",
          status: "live",
          href: "/admin/routines",
        },
      ],
    },
    {
      id: "agents",
      title: "Cloud agents",
      description:
        "Hand work to outside agents. Manus is driven from here; the rest run on their own surface and connect back.",
      connectors: [
        {
          id: "manus",
          name: "Manus",
          detail: manus
            ? "Connected. Send tasks and watch them from the Cloud page."
            : "Add MANUS_API_KEY to send tasks to Manus.",
          status: manus ? "live" : "configure",
          href: "/admin/cloud",
        },
        {
          id: "claude-code",
          name: "Claude Code",
          detail: skillDetail("Claude Code (web, CLI or desktop)"),
          status: "external",
          href: "/admin/cloud",
        },
        {
          id: "codex",
          name: "Codex",
          detail: skillDetail("the Codex CLI"),
          status: "external",
          href: "/admin/cloud",
        },
        {
          id: "openclaw",
          name: "OpenClaw",
          detail: skillDetail("OpenClaw"),
          status: "external",
          href: "/admin/cloud",
        },
        {
          id: "hermes-agent",
          name: "Hermes Agent",
          detail: skillDetail("Hermes Agent (Nous Research)"),
          status: "external",
          href: "/admin/cloud",
        },
        {
          id: "gemini",
          name: "Gemini CLI",
          detail: skillDetail("the Gemini CLI"),
          status: "external",
          href: "/admin/cloud",
        },
        {
          id: "kimi",
          name: "Kimi",
          detail: has(env, "KIMI_API_KEY", "MOONSHOT_API_KEY")
            ? "Key set. Point OpenClaw or Hermes Agent at Kimi (Moonshot)."
            : "Add KIMI_API_KEY (Moonshot) to use Kimi as a provider.",
          status: has(env, "KIMI_API_KEY", "MOONSHOT_API_KEY")
            ? "connected"
            : "configure",
          href: "/admin/cloud",
        },
      ],
    },
    {
      id: "mcp",
      title: "Connectors (MCP)",
      description:
        "Reach your team and tools from any MCP client — Claude Desktop, Claude Code, Cursor.",
      connectors: [
        {
          id: "mcp-server",
          name: "TIVA MCP server",
          detail: "Bundled. Add it to your MCP client to get the team as tools.",
          status: skillReady ? "connected" : "configure",
          href: "/admin/cloud",
        },
        {
          id: "canva",
          name: "Canva",
          detail: "Connect Canva's MCP connector in your Claude client for designs.",
          status: "external",
          href: "https://www.canva.com/",
          external: true,
        },
      ],
    },
    {
      id: "accounts",
      title: "Cloud accounts",
      description: "Where your infrastructure and workstation live.",
      connectors: [
        {
          id: "cloudflare",
          name: "Cloudflare",
          detail: "TIVA HQ, D1, R2 and the cron run here.",
          status: "live",
          href: "https://dash.cloudflare.com/",
          external: true,
        },
        {
          id: "azure",
          name: "Microsoft Azure",
          detail: "The Founder's Windows workstation and VMs.",
          status: has(env, "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID")
            ? "connected"
            : "external",
          href: "https://portal.azure.com/",
          external: true,
        },
        {
          id: "oracle",
          name: "Oracle Cloud",
          detail: "The document vault and Linux VMs.",
          status: has(env, "ORACLE_TENANCY_OCID", "OCI_TENANCY")
            ? "connected"
            : "external",
          href: "https://cloud.oracle.com/",
          external: true,
        },
      ],
    },
  ];
};

// The eight self-hosted tools, shown so the Founder can see and reach them once
// the stack is running (see ops/self-hosted). TOOLS_BASE_URL, when set to the
// workstation address, turns each into a live link.
export const selfHostedTools = (env: AgentTeamEnv): Connector[] => {
  const base = ((env as Record<string, unknown>).TOOLS_BASE_URL as string)?.trim();
  const link = (port: number, home: string) =>
    base ? `${base.replace(/\/+$/, "")}:${port}` : home;
  const status: ConnectorStatus = base ? "connected" : "external";
  return [
    { id: "excalidraw", name: "Excalidraw", detail: "Whiteboard and diagrams.", status, href: link(5001, "https://excalidraw.com/") },
    { id: "memos", name: "Memos", detail: "Quick private notes.", status, href: link(5002, "https://usememos.com/") },
    { id: "nocodb", name: "NocoDB", detail: "Airtable-style database.", status, href: link(5003, "https://nocodb.com/") },
    { id: "pocketbase", name: "PocketBase", detail: "Instant backend.", status, href: link(5004, "https://pocketbase.io/") },
    { id: "appsmith", name: "Appsmith", detail: "Internal tools and admin panels.", status, href: link(5005, "https://www.appsmith.com/") },
    { id: "hoppscotch", name: "Hoppscotch", detail: "Design and test APIs.", status, href: link(5006, "https://hoppscotch.io/") },
    { id: "docmost", name: "Docmost", detail: "Team wiki and docs.", status, href: link(5009, "https://docmost.com/") },
    { id: "deerflow", name: "DeerFlow", detail: "Deep-research SuperAgent.", status, href: link(2026, "https://github.com/bytedance/deer-flow") },
  ].map((tool) => ({ ...tool, external: true }));
};
