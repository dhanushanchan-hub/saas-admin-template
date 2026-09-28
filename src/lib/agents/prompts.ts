import * as z from "zod/v4";

import type { EntityNode } from "../services/entity";
import type {
  Agent,
  Decision,
  Entity,
  KnowledgeEntry,
  Mission,
  Task,
} from "./types";

export const ORCHESTRATOR_ID = "hermes";
export const MAX_TASKS = 6;

export const agentInstructions = (agent: Agent, company: string) => `\
You are ${agent.name}, ${agent.title} at ${company}. You are part of ${company}'s autonomous executive agent team, which works for the Founder. The Founder runs a multi-entity group.

# Your role
${agent.mission}

${agent.charter}

# How the team operates
- Hermes (Chief of Staff) turns the Founder's directives into assignments for the right specialists and writes the final brief. Specialists get one assignment at a time, together with the directive it serves and any finished work from teammates it depends on.
- The Founder makes the final call. No agent can send messages, spend money, sign documents, deploy, publish or change external systems. Your job is to produce work that the Founder or a human operator can act on straight away: finished drafts, concrete plans, specs, analyses and checklists, plus decisions framed with a recommendation.
- Be truthful about what you know. You know the company knowledge base, the directive, your teammates' outputs and your professional expertise. Never invent company-specific facts, figures, customers or commitments. When a fact you need is missing, state the assumption you're making and list it as something the Founder should confirm.
- Keep entities distinct. Whenever it matters (contracts, money, compliance, hiring, brand), say which legal entity or entities your work applies to.
- Write for a busy founder. Lead with the answer, then give the supporting detail. Use Markdown.`;

const renderEntry = (entry: KnowledgeEntry) => {
  const scope =
    entry.scope === "global" ? "all agents" : `${entry.scope}: ${entry.scope_ref}`;
  const author =
    entry.source === "founder" ? "Founder" : `learned by ${entry.author_agent_id}`;
  return `## ${entry.title}\n_(${author}; applies to ${scope})_\n\n${entry.content}`;
};

export const teamContext = (
  knowledge: { founder: KnowledgeEntry[]; learnings: KnowledgeEntry[] },
  entities: EntityNode[],
) => {
  const entityList = entities.length
    ? entities
        .map((entity) => {
          const facts = [
            `id: ${entity.id}`,
            entity.kind,
            entity.category,
            entity.region,
            entity.jurisdiction,
          ].filter(Boolean);
          return `${"  ".repeat(entity.depth)}- ${entity.name} (${facts.join("; ")})${entity.description ? `: ${entity.description}` : ""}`;
        })
        .join("\n")
    : "- No entities recorded yet.";

  return `\
# Group structure
Each entity is listed under its parent.

${entityList}

# Founder's knowledge and standing instructions
These come from the Founder and override anything else, including team learnings.

${knowledge.founder.map(renderEntry).join("\n\n") || "No entries yet."}

# Team learnings
Lessons your teammates recorded on earlier missions. Use them, but prefer the Founder's entries when they conflict.

${knowledge.learnings.map(renderEntry).join("\n\n") || "No learnings yet."}`;
};

const missionHeader = (mission: Mission, entity: Entity | null) => `\
<mission id="${mission.id}" priority="${mission.priority}" origin="${mission.origin}" entity="${entity ? entity.name : "whole group"}">
<title>${mission.title}</title>
<directive>
${mission.directive}
</directive>
</mission>`;

// Recent missions and decisions, so Hermes can plan and brief with the whole
// operating picture in view.
export const companyState = (recent: Mission[]) => {
  if (!recent.length) return "No earlier missions.";
  return recent
    .map((mission) => {
      const decisions = mission.decisions
        .map((decision) => `    - Decision needed: ${decision.question}`)
        .join("\n");
      return `- #${mission.id} ${mission.title} (${mission.status}, ${mission.created_at} UTC)${mission.plan_summary ? `\n    ${mission.plan_summary}` : ""}${decisions ? `\n${decisions}` : ""}`;
    })
    .join("\n");
};

// Planning

export const planSchema = (agentIds: string[]) =>
  z.object({
    title: z
      .string()
      .describe("A short, specific title for the mission (under 80 characters)."),
    summary: z
      .string()
      .describe("One paragraph for the Founder: how the team will approach this."),
    tasks: z.array(
      z.object({
        key: z
          .string()
          .describe("Short unique identifier for this assignment, e.g. 'pricing-model'."),
        // Validated against the active team in code: the structured-output
        // schema carries the allowed ids as guidance rather than an enum.
        agent_id: z
          .string()
          .describe(`Exactly one of: ${agentIds.join(", ")}.`),
        title: z.string(),
        instructions: z
          .string()
          .describe("What to produce, the standard it must meet, and any constraints."),
        depends_on: z
          .array(z.string())
          .describe("Keys of earlier assignments whose output this one needs."),
      }),
    ),
  });

export const planPrompt = ({
  mission,
  entity,
  team,
  recent,
}: {
  mission: Mission;
  entity: Entity | null;
  team: Agent[];
  recent: Mission[];
}) => `\
${missionHeader(mission, entity)}

<team>
${team.map((agent) => `- ${agent.id}: ${agent.name}, ${agent.title}. ${agent.mission}`).join("\n")}
</team>

<recent_missions>
${companyState(recent)}
</recent_missions>

Plan how the team will deliver this directive. Break it into between 1 and ${MAX_TASKS} assignments, each owned by exactly one agent from the team above (you can assign coordination work to yourself as "${ORCHESTRATOR_ID}"). Involve only the agents whose expertise the outcome needs.

Give each assignment instructions that a senior specialist could act on without asking questions: the deliverable, the standard it must meet, and the constraints. When an assignment needs another's output, list that assignment's key in depends_on and put it earlier in the list. Assignments with no dependency on each other run in parallel.`;

// Execution

export const resultSchema = z.object({
  summary: z
    .string()
    .describe("Two or three sentences summarising the deliverable for teammates."),
  deliverable: z
    .string()
    .describe("The complete work product in Markdown, ready for the Founder to use."),
  decisions_needed: z
    .array(z.string())
    .describe("Questions only the Founder can answer, each with your recommendation."),
  learnings: z
    .array(
      z.object({
        title: z.string(),
        content: z.string(),
        share_with: z
          .enum(["team", "department"])
          .describe("'team' if every agent should know this, otherwise 'department'."),
      }),
    )
    .describe(
      "Durable facts or lessons from this work worth remembering on future missions. Leave empty unless something genuinely reusable came up.",
    ),
});

export const taskPrompt = ({
  mission,
  entity,
  task,
  dependencies,
  siblings,
  agents,
}: {
  mission: Mission;
  entity: Entity | null;
  task: Task;
  dependencies: Task[];
  siblings: Task[];
  agents: Map<string, Agent>;
}) => {
  const who = (id: string) => {
    const agent = agents.get(id);
    return agent ? `${agent.name} (${agent.title})` : id;
  };
  const inputs = dependencies.length
    ? dependencies
        .map(
          (dep) =>
            `<teammate_output from="${who(dep.agent_id)}" assignment="${dep.title}">\n${dep.output ?? `Not available: ${dep.error ?? dep.status}`}\n</teammate_output>`,
        )
        .join("\n\n")
    : "None. Your assignment doesn't depend on other work.";
  const others = siblings
    .filter((sibling) => sibling.id !== task.id)
    .map((sibling) => `- ${who(sibling.agent_id)}: ${sibling.title}`)
    .join("\n");

  return `\
${missionHeader(mission, entity)}

<plan>
${mission.plan_summary ?? ""}
</plan>

<your_assignment title="${task.title}">
${task.instructions}
</your_assignment>

<inputs>
${inputs}
</inputs>

<other_assignments>
${others || "None."}
</other_assignments>

Complete your assignment. The deliverable should be finished work, not a description of the work you would do.`;
};

// Synthesis

export const briefSchema = z.object({
  brief: z
    .string()
    .describe("The Founder's executive brief in Markdown."),
  decisions: z
    .array(
      z.object({
        question: z.string(),
        recommendation: z.string(),
        owner: z.string().describe("Name of the agent who will act on the answer."),
      }),
    )
    .describe("Decisions the Founder needs to make, most important first."),
});

export type Brief = { brief: string; decisions: Decision[] };

export const briefPrompt = ({
  mission,
  entity,
  tasks,
  agents,
  recent,
}: {
  mission: Mission;
  entity: Entity | null;
  tasks: Task[];
  agents: Map<string, Agent>;
  recent: Mission[];
}) => `\
${missionHeader(mission, entity)}

<plan>
${mission.plan_summary ?? ""}
</plan>

${tasks
  .map((task) => {
    const agent = agents.get(task.agent_id);
    const body =
      task.status === "completed"
        ? `${task.output}\n\nDecisions raised: ${task.decisions.length ? task.decisions.join(" | ") : "none"}`
        : `This assignment ${task.status === "skipped" ? "was skipped" : "failed"}: ${task.error ?? "no reason recorded"}`;
    return `<assignment agent="${agent ? `${agent.name}, ${agent.title}` : task.agent_id}" title="${task.title}" status="${task.status}">\n${body}\n</assignment>`;
  })
  .join("\n\n")}

<recent_missions>
${companyState(recent)}
</recent_missions>

Write the Founder's brief for this mission. Open with the outcome in two or three sentences. Then give the key results from each assignment, keeping the substance the Founder needs (numbers, drafts, plans) rather than just describing it, and the next actions with owners. Point out any conflicts between assignments, gaps from failed or skipped work, and assumptions the Founder must confirm.

List the decisions the Founder must make separately, each with a clear recommendation. Merge duplicates raised by different agents.`;
