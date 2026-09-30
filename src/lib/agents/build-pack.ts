import type { Agent, Entity, Mission, Task } from "./types";

// A mission's work as one Markdown document a coding agent such as Claude Code
// can build from: the directive, the plan, every deliverable in order, and the
// brief with the Founder's decisions.
export const buildPack = ({
  mission,
  entity,
  tasks,
  agents,
  url,
}: {
  mission: Mission;
  entity: Entity | null;
  tasks: Task[];
  agents: Map<string, Agent>;
  url: string;
}) => {
  const who = (id: string) => {
    const agent = agents.get(id);
    return agent ? `${agent.name}, ${agent.title}` : id;
  };

  return `${[
    `# Build pack: ${mission.title}`,
    `Mission #${mission.id} · ${entity ? entity.name : "Whole group"} · ${mission.status} · ${url}`,
    "> For the coding agent: build what this describes, in a new repository unless it names one. Ask the Founder before anything that deploys, publishes, spends money or changes an existing system, and never write secret values into code.",
    `## Directive\n\n${mission.directive}`,
    mission.plan_summary && `## Plan\n\n${mission.plan_summary}`,
    ...tasks.map(
      (task) =>
        `## ${task.title}\n\n_${who(task.agent_id)} · ${task.status}_\n\n${task.output ?? `Not delivered: ${task.error ?? task.status}`}`,
    ),
    mission.brief && `## Brief from Hermes\n\n${mission.brief}`,
    mission.decisions.length > 0 &&
      `## Decisions for the Founder\n\n${mission.decisions
        .map(
          (decision, index) =>
            `${index + 1}. ${decision.question}\n   Recommendation: ${decision.recommendation} (owner: ${decision.owner})`,
        )
        .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n")}\n`;
};
