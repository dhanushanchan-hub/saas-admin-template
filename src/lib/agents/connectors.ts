// The master junction: every platform, agent, connector, device and account
// TIVA HQ knows about, with a status read from what's actually configured.
// Powers the /admin/junction monitoring dashboard and the /api/status endpoint.
//
// Status is computed from the Worker's environment — a connector is "active"
// once its key/secret is set. External devices and platforms that run on their
// own surface show "Connect" with what to add. Nothing here makes a network
// call, so the snapshot is instant and can't hang the dashboard.

import { manusConfigured } from "./manus";
import type { AgentTeamEnv } from "./types";

export type ConnectorStatus =
  | "live" // TIVA HQ drives it right now
  | "connected" // configured / a key is set
  | "configure" // one step away — a key or secret is missing
  | "external"; // runs on its own surface, connected through the skill/MCP

// For the monitoring view: which statuses count as "active".
export const isActive = (status: ConnectorStatus) =>
  status === "live" || status === "connected";

export type Connector = {
  id: string;
  name: string;
  detail: string;
  status: ConnectorStatus;
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
  live: "Active",
  connected: "Active",
  configure: "Add key",
  external: "Connect",
};

// Reads an optional secret/var that isn't in the typed Env, without throwing.
export const has = (env: AgentTeamEnv, ...keys: string[]) =>
  keys.some((key) => {
    const value = (env as Record<string, unknown>)[key];
    return typeof value === "string" && value.trim().length > 0;
  });

// An env-keyed connector: active when any of its keys is set, else "add key".
const keyed = (
  env: AgentTeamEnv,
  base: Omit<Connector, "status"> & { keys: string[] },
): Connector => {
  const { keys, ...rest } = base;
  return { ...rest, status: has(env, ...keys) ? "connected" : "configure" };
};

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
        { id: "claude-code", name: "Claude Code", detail: skillDetail("Claude Code (web, CLI or desktop)"), status: "external", href: "/admin/cloud" },
        { id: "codex", name: "Codex", detail: skillDetail("the Codex CLI"), status: "external", href: "/admin/cloud" },
        { id: "openclaw", name: "OpenClaw", detail: skillDetail("OpenClaw"), status: "external", href: "/admin/cloud" },
        { id: "hermes-agent", name: "Hermes Agent", detail: skillDetail("Hermes Agent (Nous Research)"), status: "external", href: "/admin/cloud" },
        { id: "gemini", name: "Gemini CLI", detail: skillDetail("the Gemini CLI"), status: "external", href: "/admin/cloud" },
        {
          id: "copilot",
          name: "GitHub Copilot",
          detail: "Copilot CLI and the VS Code extensions; the desktop setup installs them.",
          status: "external",
          href: "https://github.com/features/copilot",
          external: true,
        },
        keyed(env, {
          id: "kimi",
          name: "Kimi",
          detail: has(env, "KIMI_API_KEY", "MOONSHOT_API_KEY")
            ? "Key set. Point OpenClaw or Hermes Agent at Kimi (Moonshot)."
            : "Add KIMI_API_KEY (Moonshot) to use Kimi as a provider.",
          href: "/admin/cloud",
          keys: ["KIMI_API_KEY", "MOONSHOT_API_KEY"],
        }),
      ],
    },
    {
      id: "mcp",
      title: "Devices & MCP",
      description:
        "Reach your team and tools from any MCP client — desktop, phone, editor.",
      connectors: [
        {
          id: "mcp-server",
          name: "TIVA MCP server",
          detail: "Bundled. Add it to an MCP client to get the team as tools.",
          status: skillReady ? "connected" : "configure",
          href: "/admin/cloud",
        },
        keyed(env, {
          id: "windows-mcp",
          name: "Windows MCP",
          detail: has(env, "WINDOWS_MCP_URL")
            ? "Windows workstation MCP registered."
            : "Run the TIVA MCP server on the Windows workstation; set WINDOWS_MCP_URL to track it here.",
          href: "/admin/cloud",
          keys: ["WINDOWS_MCP_URL"],
        }),
        keyed(env, {
          id: "ios-mcp",
          name: "iOS MCP",
          detail: has(env, "IOS_MCP_URL")
            ? "iOS MCP client registered."
            : "Add the TIVA MCP server to your iOS MCP client; set IOS_MCP_URL to track it here.",
          href: "/admin/cloud",
          keys: ["IOS_MCP_URL"],
        }),
        {
          id: "browser-mcp",
          name: "Web Browser MCP",
          detail: "Playwright MCP — drive a real browser from any agent. Wired by the desktop setup.",
          status: "external",
          href: "https://github.com/microsoft/playwright-mcp",
          external: true,
        },
        {
          id: "github-mcp",
          name: "GitHub MCP",
          detail: "The official hosted GitHub MCP server (repos, issues, PRs). Wired by the desktop setup.",
          status: "external",
          href: "https://github.com/github/github-mcp-server",
          external: true,
        },
        {
          id: "filesystem-mcp",
          name: "Filesystem MCP",
          detail: "Read and write local files from any agent. Wired by the desktop setup.",
          status: "external",
          href: "https://github.com/modelcontextprotocol/servers",
          external: true,
        },
        {
          id: "desktop-commander",
          name: "Desktop Commander",
          detail: "Terminal, files and processes on the Windows desktop. Wired by the desktop setup.",
          status: "external",
          href: "https://desktopcommander.app/",
          external: true,
        },
        {
          id: "canva",
          name: "Canva",
          detail: "Connect Canva's MCP connector in your Claude client for designs.",
          status: has(env, "CANVA_ACCESS_TOKEN") ? "connected" : "external",
          href: "https://www.canva.com/",
          external: true,
        },
      ],
    },
    {
      id: "social",
      title: "Social & messaging",
      description:
        "Platform APIs the team can draft for and post through, once you add each key.",
      connectors: [
        keyed(env, { id: "x", name: "X (Twitter)", detail: "Post and read on X.", href: "https://developer.x.com/", external: true, keys: ["X_API_KEY", "TWITTER_BEARER_TOKEN"] }),
        keyed(env, { id: "linkedin", name: "LinkedIn", detail: "Company and personal posts.", href: "https://www.linkedin.com/developers/", external: true, keys: ["LINKEDIN_ACCESS_TOKEN"] }),
        keyed(env, { id: "instagram", name: "Instagram", detail: "Posts and insights (Meta).", href: "https://developers.facebook.com/", external: true, keys: ["INSTAGRAM_ACCESS_TOKEN", "META_ACCESS_TOKEN"] }),
        keyed(env, { id: "facebook", name: "Facebook", detail: "Pages and insights (Meta).", href: "https://developers.facebook.com/", external: true, keys: ["FACEBOOK_ACCESS_TOKEN", "META_ACCESS_TOKEN"] }),
        keyed(env, { id: "youtube", name: "YouTube", detail: "Channel and video data.", href: "https://console.cloud.google.com/", external: true, keys: ["YOUTUBE_API_KEY", "GOOGLE_API_KEY"] }),
        keyed(env, { id: "tiktok", name: "TikTok", detail: "Posts and analytics.", href: "https://developers.tiktok.com/", external: true, keys: ["TIKTOK_ACCESS_TOKEN"] }),
        keyed(env, { id: "reddit", name: "Reddit", detail: "Read and post to subreddits.", href: "https://www.reddit.com/prefs/apps", external: true, keys: ["REDDIT_CLIENT_ID"] }),
        keyed(env, { id: "telegram", name: "Telegram", detail: "Bot messaging channel.", href: "https://core.telegram.org/bots", external: true, keys: ["TELEGRAM_BOT_TOKEN"] }),
        keyed(env, { id: "whatsapp", name: "WhatsApp", detail: "Business messaging (Meta).", href: "https://developers.facebook.com/docs/whatsapp", external: true, keys: ["WHATSAPP_TOKEN", "WHATSAPP_ACCESS_TOKEN"] }),
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
          status: has(env, "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID") ? "connected" : "external",
          href: "https://portal.azure.com/",
          external: true,
        },
        {
          id: "oracle",
          name: "Oracle Cloud",
          detail: "The document vault and Linux VMs.",
          status: has(env, "ORACLE_TENANCY_OCID", "OCI_TENANCY") ? "connected" : "external",
          href: "https://cloud.oracle.com/",
          external: true,
        },
      ],
    },
  ];
};

// The eight self-hosted tools, shown so the Founder can see and reach them once
// the stack is running (see ops/self-hosted). TOOLS_BASE_URL, when set to the
// workstation address, turns each into a live link and marks it active.
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

// The whole junction as one list of groups (the self-hosted tools included),
// shared by the dashboard and the /api/status endpoint.
export const allConnectorGroups = (
  env: AgentTeamEnv,
  origin: string,
): ConnectorGroup[] => [
  ...connectorGroups(env, origin),
  {
    id: "tools",
    title: "Self-hosted tools",
    description:
      "Your own tools on the workstation (see ops/self-hosted). Set TOOLS_BASE_URL to link and track them.",
    connectors: selfHostedTools(env),
  },
];
