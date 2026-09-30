// Everything Claude Code has built for TIVA HQ. Each delivery is a pull
// request from a claude/ branch of the repository. The Master Dashboard reads
// their live state from GitHub in the browser; this list adds a summary in
// plain words, and is shown as-is when GitHub can't be reached. Add an entry
// when a new delivery lands.

export const REPOSITORY = "dhanushanchan-hub/saas-admin-template";
export const SNAPSHOT_DATE = "2026-09-30";

export type DeliveryStatus = "live" | "review" | "closed";

export type Delivery = {
  number: number;
  title: string;
  status: DeliveryStatus;
  opened_at: string;
  merged_at: string | null;
  summary?: string;
  // Where to open it in TIVA HQ once it's live.
  links?: { label: string; href: string }[];
};

// The fields of a GitHub pull request the dashboard uses.
export type PullRequest = {
  number: number;
  title: string;
  state: "open" | "closed";
  created_at: string;
  merged_at: string | null;
  head: { ref: string };
};

export const DELIVERIES: Delivery[] = [
  {
    number: 8,
    title: "Master Dashboard home page, and the Build Studio for apps, websites and software",
    status: "review",
    opened_at: "2026-09-30T12:15:05Z",
    merged_at: null,
    summary:
      "This home page: everything TIVA HQ runs and everything Claude Code has built, in one place. Plus the Build Studio, six agents who design and code your websites, apps and software and hand each build to Claude Code as a build pack.",
    links: [
      { label: "Master Dashboard", href: "/" },
      { label: "Build Studio", href: "/admin/studio" },
    ],
  },
  {
    number: 7,
    title: "Azure VM audit — end-to-end analysis + auto-remediation",
    status: "review",
    opened_at: "2026-09-30T11:55:01Z",
    merged_at: null,
    summary:
      "An audit of your two Azure machines with ranked fixes (updates, backups, public access), a script that applies the safe fixes, and a plan to cut the compute bill by about 44%.",
  },
  {
    number: 6,
    title: "Add TIVA Cloud: master junction, Manus bridge, MCP server, self-hosted tools",
    status: "review",
    opened_at: "2026-09-28T15:19:01Z",
    merged_at: null,
    summary:
      "A master junction page that shows every connector as live or needing a key, a working bridge that hands tasks to Manus, an MCP server so Claude Desktop, Claude Code and Cursor can reach the team, self-hosted tools for your workstation, and a one-run desktop setup script.",
    links: [
      { label: "Master junction", href: "/admin/junction" },
      { label: "Cloud agents", href: "/admin/cloud" },
    ],
  },
  {
    number: 5,
    title: "Add Claude Code toolkit and TIVA Bible Windows setup",
    status: "review",
    opened_at: "2026-09-28T14:59:27Z",
    merged_at: null,
    summary:
      "Five open-source add-ons for every Claude Code session on this code (a skill security scanner, in-app checks, shorter replies, and UI and writing quality checks), plus the TIVA Bible: one PowerShell run that sets up Claude Code, Kimi Code and OpenClaw on your Windows PC and tidies it.",
  },
  {
    number: 4,
    title: "Founder setup scripts, agent instructions, and turn off public preview copies of TIVA HQ",
    status: "review",
    opened_at: "2026-09-28T10:21:47Z",
    merged_at: null,
    summary:
      "Security fix: switches off public preview copies of TIVA HQ, which can read company data without your password. Also the scripts that build your Azure workstation and Oracle document vault, and the instructions AI agents follow when they work on this code.",
  },
  {
    number: 3,
    title: "TIVA HQ go-live: agent team, founder login, and the dump",
    status: "live",
    opened_at: "2026-09-28T01:16:39Z",
    merged_at: "2026-09-28T01:44:53Z",
    summary:
      "Your password on every page, and the dump: drop in files, photos, voice notes or text, and the team reads and searches them before it works.",
    links: [{ label: "Dump", href: "/admin/dump" }],
  },
  {
    number: 2,
    title: "Add TIVA autonomous executive agent team (Hermes, CTO + 12 executives, chat, voice, installable app)",
    status: "live",
    opened_at: "2026-09-28T00:34:59Z",
    merged_at: "2026-09-28T01:44:54Z",
    summary:
      "Hermes and 13 executives who plan and run missions in parallel and brief you with the decisions only you can make, with 24/7 routines, team memory, the group structure, chat and voice with Hermes, and the installable app.",
    links: [
      { label: "Hermes", href: "/admin/hermes" },
      { label: "Command Center", href: "/admin/command" },
      { label: "Agents", href: "/admin/agents" },
      { label: "Routines", href: "/admin/routines" },
    ],
  },
  {
    number: 1,
    title: "Add one-shot installer for Claude Code + Codex CLI",
    status: "review",
    opened_at: "2026-06-08T21:55:09Z",
    merged_at: null,
    summary:
      "One script that installs Claude Code and the Codex CLI on a Linux server such as the Oracle machine.",
  },
];

const known = new Map(DELIVERIES.map((delivery) => [delivery.number, delivery]));

// Claude Code's pull requests with their live state, each with its summary.
export const toDeliveries = (pulls: PullRequest[]): Delivery[] =>
  pulls
    .filter((pull) => pull.head.ref.startsWith("claude/"))
    .map((pull) => ({
      ...known.get(pull.number),
      number: pull.number,
      title: pull.title,
      status: pull.merged_at ? "live" : pull.state === "open" ? "review" : "closed",
      opened_at: pull.created_at,
      merged_at: pull.merged_at,
    }));

export const PULL_REQUESTS_API = `https://api.github.com/repos/${REPOSITORY}/pulls?state=all&per_page=100`;
export const PULL_REQUESTS_URL = `https://github.com/${REPOSITORY}/pulls`;
export const pullRequestUrl = (number: number) =>
  `https://github.com/${REPOSITORY}/pull/${number}`;
