#!/usr/bin/env node
// Command-line client for the TIVA HQ agent team API. Used by the
// tiva-agent-team skill (OpenClaw, Hermes Agent, Claude Code) and handy from
// any terminal or automation. Needs Node 18+ and no dependencies.
//
//   TIVA_HQ_URL     Base URL of TIVA HQ, e.g. https://tiva-hq.example.workers.dev
//   TIVA_HQ_TOKEN   The API_TOKEN secret configured on the Worker
//   TIVA_HQ_ACCESS_CLIENT_ID / TIVA_HQ_ACCESS_CLIENT_SECRET
//                   Optional Cloudflare Access service token, when HQ is
//                   protected by Cloudflare Access.

const USAGE = `Usage: node tiva.mjs <command> [options]

Commands
  brief                                  In-flight missions, latest briefs and decisions waiting on the Founder
  mission "<directive>" [--entity <id>] [--priority low|normal|high|critical] [--title "<title>"] [--wait]
                                         Give Hermes a directive; --wait blocks until the brief is ready
  status <mission-id>                    Progress, assignments and brief for one mission
  build-pack <mission-id>                Everything a Build Studio mission produced, as one Markdown document to build from
  missions [--status <status>] [--limit <n>]
  remember "<text>" [--title "<title>"] [--scope global|department|entity|agent] [--ref <id>]
                                         Save something to the team's long-term memory
  agents                                 The agent team
  entities                               The group structure (parent and child entities)
  routines                               24/7 routines and their schedules
  run-routine <routine-id>               Run a routine now`;

const baseUrl = (process.env.TIVA_HQ_URL || "").replace(/\/+$/, "");
const token = process.env.TIVA_HQ_TOKEN || "";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const parseArgs = (argv) => {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else flags[key] = argv[++i];
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
};

// Returns the parsed JSON body, or the text itself with { text: true }.
const api = async (method, path, body, { text: asText = false } = {}) => {
  const headers = {
    Authorization: `Bearer ${token}`,
    // Astro rejects body-less POSTs without a JSON content type.
    "Content-Type": "application/json",
  };
  if (process.env.TIVA_HQ_ACCESS_CLIENT_ID) {
    headers["CF-Access-Client-Id"] = process.env.TIVA_HQ_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.TIVA_HQ_ACCESS_CLIENT_SECRET || "";
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (asText && response.ok) return text;
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    fail(`TIVA HQ returned ${response.status} with a non-JSON body. Check TIVA_HQ_URL (and Cloudflare Access credentials if HQ is behind Access).`);
  }
  if (!response.ok) {
    const issue = data?.issues?.[0];
    fail(`TIVA HQ error ${response.status}: ${issue ? `${issue.path?.join(".")}: ${issue.message}` : data?.message ?? text}`);
  }
  return data;
};

const printMission = ({ mission, tasks }) => {
  console.log(`# Mission #${mission.id}: ${mission.title}`);
  console.log(`Status: ${mission.status} · Priority: ${mission.priority} · ${baseUrl}/admin/missions/${mission.id}`);
  if (mission.error) console.log(`Error: ${mission.error}`);
  if (tasks?.length) {
    console.log("\n## Assignments");
    for (const task of tasks) {
      console.log(`- [${task.status}] ${task.agent_id}: ${task.title}${task.summary ? ` — ${task.summary}` : ""}${task.error ? ` (${task.error})` : ""}`);
    }
  }
  if (mission.brief) console.log(`\n## Brief from Hermes\n\n${mission.brief}`);
  if (mission.decisions?.length) {
    console.log("\n## Decisions for the Founder");
    mission.decisions.forEach((decision, index) =>
      console.log(`${index + 1}. ${decision.question}\n   Recommendation: ${decision.recommendation} (owner: ${decision.owner})`),
    );
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const commands = {
  async brief() {
    const data = await api("GET", "/api/briefing");
    const { stats } = data;
    console.log(`# TIVA HQ briefing\n\nIn flight: ${stats.in_flight} · Completed in 24h: ${stats.completed_24h} · Failed in 24h: ${stats.failed_24h}`);
    if (data.in_flight.length) {
      console.log("\n## In flight");
      data.in_flight.forEach((m) => console.log(`- #${m.id} ${m.title} (${m.status}, ${m.priority})`));
    }
    if (data.decisions.length) {
      console.log("\n## Decisions waiting on the Founder");
      data.decisions.forEach((d, i) =>
        console.log(`${i + 1}. ${d.question}\n   Recommendation: ${d.recommendation} (owner: ${d.owner}; mission #${d.mission_id})`),
      );
    }
    for (const m of data.latest_briefs) {
      console.log(`\n## Latest brief: #${m.id} ${m.title}\n\n${m.brief}`);
    }
  },

  async mission({ positional, flags }) {
    const directive = positional.join(" ").trim();
    if (!directive) fail('Give a directive, e.g. node tiva.mjs mission "Plan the Master ID MVP launch" --wait');
    const { mission } = await api("POST", "/api/missions", {
      directive,
      title: typeof flags.title === "string" ? flags.title : undefined,
      entity_id: typeof flags.entity === "string" ? flags.entity : undefined,
      priority: typeof flags.priority === "string" ? flags.priority : undefined,
      origin: "api",
    });
    console.log(`Hermes has mission #${mission.id}: ${baseUrl}/admin/missions/${mission.id}`);
    if (!flags.wait) return;

    const deadline = Date.now() + 30 * 60 * 1000;
    let last = "";
    while (Date.now() < deadline) {
      await sleep(10000);
      const data = await api("GET", `/api/missions/${mission.id}`);
      if (data.mission.status !== last) {
        last = data.mission.status;
        console.error(`… ${last}`);
      }
      if (["completed", "failed"].includes(data.mission.status)) {
        printMission(data);
        return;
      }
    }
    console.log(`Still running after 30 minutes. Check later with: node tiva.mjs status ${mission.id}`);
  },

  async status({ positional }) {
    const id = Number(positional[0]);
    if (!Number.isInteger(id)) fail("Usage: node tiva.mjs status <mission-id>");
    printMission(await api("GET", `/api/missions/${id}`));
  },

  async "build-pack"({ positional }) {
    const id = Number(positional[0]);
    if (!Number.isInteger(id)) fail("Usage: node tiva.mjs build-pack <mission-id>");
    process.stdout.write(await api("GET", `/api/missions/${id}/pack`, undefined, { text: true }));
  },

  async missions({ flags }) {
    const params = new URLSearchParams();
    if (typeof flags.status === "string") params.set("status", flags.status);
    params.set("limit", typeof flags.limit === "string" ? flags.limit : "20");
    const { missions } = await api("GET", `/api/missions?${params}`);
    if (!missions.length) return console.log("No missions.");
    missions.forEach((m) => console.log(`- #${m.id} [${m.status}] ${m.title} (${m.priority}, ${m.origin}, ${m.created_at} UTC)`));
  },

  async remember({ positional, flags }) {
    const content = positional.join(" ").trim();
    if (!content) fail('Usage: node tiva.mjs remember "<what the team should know>"');
    const firstLine = content.split("\n")[0];
    const { entry } = await api("POST", "/api/knowledge", {
      title: typeof flags.title === "string" ? flags.title : firstLine.slice(0, 80),
      content,
      scope: typeof flags.scope === "string" ? flags.scope : "global",
      scope_ref: typeof flags.ref === "string" ? flags.ref : undefined,
    });
    console.log(`Saved to the team's memory as entry #${entry.id} ("${entry.title}").`);
  },

  async agents() {
    const { agents } = await api("GET", "/api/agents");
    agents.forEach((a) => console.log(`- ${a.id}: ${a.name}, ${a.title} [${a.status}]${a.reports_to ? ` (reports to ${a.reports_to})` : ""}`));
  },

  async entities() {
    const { entities } = await api("GET", "/api/entities");
    entities.forEach((e) =>
      console.log(`${"  ".repeat(e.depth ?? 0)}- ${e.name} (id: ${e.id}; ${[e.kind, e.category, e.region].filter(Boolean).join("; ")})`),
    );
  },

  async routines() {
    const { routines } = await api("GET", "/api/routines");
    routines.forEach((r) =>
      console.log(`- ${r.id}: ${r.name} — ${r.cadence} at ${String(r.hour_utc).padStart(2, "0")}:00 UTC${r.cadence === "weekly" ? ` (weekday ${r.weekday})` : ""} [${r.enabled ? "enabled" : "paused"}], last run ${r.last_run_at ?? "never"}`),
    );
  },

  async "run-routine"({ positional }) {
    if (!positional[0]) fail("Usage: node tiva.mjs run-routine <routine-id>");
    const { mission } = await api("POST", `/api/routines/${encodeURIComponent(positional[0])}/run`);
    console.log(`Started mission #${mission.id}: ${baseUrl}/admin/missions/${mission.id}`);
  },
};

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "--help" || !commands[command]) {
  console.log(USAGE);
  process.exit(command && !commands[command] && command !== "help" && command !== "--help" ? 1 : 0);
}
if (!baseUrl || !token) fail("Set TIVA_HQ_URL and TIVA_HQ_TOKEN first.");

commands[command](parseArgs(rest)).catch((error) => fail(`Could not reach TIVA HQ at ${baseUrl}: ${error.message}`));
