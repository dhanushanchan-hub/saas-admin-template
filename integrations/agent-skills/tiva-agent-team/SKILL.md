---
name: tiva-agent-team
description: Delegate work to the TIVA executive agent team (Hermes, the CTO, CFO, General Counsel, the Build Studio and the other executives) and read their briefs. Use when the Founder asks for something to be planned, researched, drafted, designed or decided for TIVA or any TIVA entity, asks for a status update, their brief or pending decisions, wants the team to remember something, or asks you to build a TIVA build pack.
metadata: { "openclaw": { "requires": { "bins": ["node"], "env": ["TIVA_HQ_URL", "TIVA_HQ_TOKEN"] }, "primaryEnv": "TIVA_HQ_TOKEN" } }
---

# TIVA agent team

TIVA HQ runs the Founder's autonomous executive team. Hermes (Chief of Staff) turns each directive into assignments for the right executives, such as Atlas (CTO), Ledger (CFO), Aegis (General Counsel), Orbit (COO), Echo (CMO), Apex (CRO), Prism (Strategy) and the Build Studio, led by Daedalus, which builds websites, apps and software. They work in parallel, and Hermes returns one brief with the decisions only the Founder can make. The team also runs 24/7 routines, like the Founder's daily brief.

The team plans, researches, drafts and decides. It doesn't touch external systems. You carry out approved steps on this machine only when the Founder asks you to.

## How to call it

Use the helper script in this skill's `scripts/` folder. It needs `TIVA_HQ_URL` and `TIVA_HQ_TOKEN` in the environment. The paths below are relative to this skill's folder; from anywhere else, use the full path. On the Founder's Windows desktop that's:

```
node "$env:USERPROFILE\.agents\skills\tiva-agent-team\scripts\tiva.mjs" <command> [options]
```

| The Founder wants... | Run |
| --- | --- |
| Their brief, status or pending decisions | `node scripts/tiva.mjs brief` |
| Something planned, drafted, researched or decided | `node scripts/tiva.mjs mission "<directive>" --wait` |
| The same, for one company | add `--entity <entity-id>` (list them with `node scripts/tiva.mjs entities`) |
| Urgent work | add `--priority high` or `--priority critical` |
| Progress on a mission | `node scripts/tiva.mjs status <mission-id>` |
| A website, app or software built | Start a mission and say it's for the Build Studio, then build its build pack (below) |
| To build a finished build pack | `node scripts/tiva.mjs build-pack <mission-id>` |
| The team to remember something | `node scripts/tiva.mjs remember "<fact, goal or preference>"` |
| Who is on the team | `node scripts/tiva.mjs agents` |
| Scheduled routines, or run one now | `node scripts/tiva.mjs routines`, then `node scripts/tiva.mjs run-routine <id>` |

## Writing directives

Pass the Founder's request through in their own words and add any context you already have from the conversation: which entity it's for, deadlines, budgets, constraints. Hermes decides who works on it, so don't split the work up yourself.

A mission usually takes a few minutes. `--wait` blocks for up to 30 minutes and then prints the brief. For long work, start the mission without `--wait`, tell the Founder the mission link, and check back later with `status`.

## Building from a build pack

The Build Studio (Daedalus with Iris, Loom, Kite, Anvil and Verity) plans, designs and writes each build, and ends with a build pack: the directive, the plan, every deliverable and the Founder's decisions in one Markdown document. When the Founder asks you to build one:

1. Fetch it with `node scripts/tiva.mjs build-pack <mission-id>` and read all of it. If the Founder still has open decisions, ask them first.
2. Build it in the repository the pack names, or a new one. Write every file, install dependencies, and run the tests it lists until they pass.
3. Stop and ask the Founder before anything that deploys, publishes, submits to an app store, spends money or changes an existing system. Secrets go in environment variables or the platform's secret store, never in code.
4. Report what you built, where it is, the test results, and what is waiting for the Founder's approval.

## Reporting back

Lead with Hermes's outcome, then list the decisions waiting on the Founder together with the team's recommendations. Link the mission page for the full deliverables. Don't restate every assignment unless the Founder asks for them.

When the Founder tells you something durable about themselves, the companies, goals or preferences, offer to save it with `remember` so the whole team learns it.
