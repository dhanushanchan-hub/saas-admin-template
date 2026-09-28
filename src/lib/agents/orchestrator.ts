import { ActivityService } from "../services/activity";
import { AgentService } from "../services/agent";
import { EntityService } from "../services/entity";
import { KnowledgeService } from "../services/knowledge";
import { MissionService, type PlannedTask } from "../services/mission";
import { callAgent, DEFAULT_MODEL } from "./llm";
import {
  agentInstructions,
  briefPrompt,
  briefSchema,
  MAX_TASKS,
  ORCHESTRATOR_ID,
  planPrompt,
  planSchema,
  resultSchema,
  taskPrompt,
  teamContext,
} from "./prompts";
import type {
  Agent,
  AgentTeamEnv,
  Mission,
  MissionOrigin,
  MissionPriority,
} from "./types";

const RECENT_MISSIONS = 10;

const companyName = (env: AgentTeamEnv) => env.COMPANY_NAME || "TIVA";
const modelFor = (env: AgentTeamEnv, agent: Agent) =>
  agent.model || env.AGENT_MODEL || DEFAULT_MODEL;

export const errorMessage = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000);

// The provisional title a mission gets before Hermes names it.
export const titleFromDirective = (directive: string) => {
  const oneLine = directive.replace(/\s+/g, " ").trim();
  return oneLine.length > 80 ? `${oneLine.slice(0, 77)}...` : oneLine;
};

const services = (env: AgentTeamEnv) => ({
  activity: new ActivityService(env.DB),
  agents: new AgentService(env.DB),
  entities: new EntityService(env.DB),
  knowledge: new KnowledgeService(env.DB),
  missions: new MissionService(env.DB),
});

const loadMission = async (env: AgentTeamEnv, missionId: number) => {
  const { missions, entities } = services(env);
  const mission = await missions.getById(missionId);
  if (!mission) throw new Error(`Mission ${missionId} not found`);
  const entity = mission.entity_id
    ? await entities.getById(mission.entity_id)
    : null;
  return { mission, entity };
};

const getOrchestrator = async (env: AgentTeamEnv) => {
  const hermes = await new AgentService(env.DB).getById(ORCHESTRATOR_ID);
  if (!hermes) throw new Error(`The orchestrator agent "${ORCHESTRATOR_ID}" is missing`);
  return hermes;
};

const recentMissions = async (env: AgentTeamEnv, excludeId: number) =>
  (await new MissionService(env.DB).getAll({ limit: RECENT_MISSIONS + 1 }))
    .filter((mission) => mission.id !== excludeId)
    .slice(0, RECENT_MISSIONS);

// Creates a mission and starts its durable workflow.
export async function launchMission(
  env: AgentTeamEnv,
  input: {
    directive: string;
    title?: string;
    entity_id?: string | null;
    priority?: MissionPriority;
    origin?: MissionOrigin;
    routine_id?: string | null;
  },
) {
  const { missions, activity } = services(env);
  const mission = await missions.create({
    ...input,
    title: input.title?.trim() || titleFromDirective(input.directive),
  });

  try {
    const instance = await env.MISSION_WORKFLOW.create({
      id: `mission-${mission.id}-${Date.now()}`,
      params: { missionId: mission.id },
    });
    await env.DB.batch([
      missions.updateStatement(mission.id, { workflow_instance_id: instance.id }),
      activity.statement({
        mission_id: mission.id,
        agent_id: ORCHESTRATOR_ID,
        kind: "mission.created",
        message: `New ${mission.origin} mission #${mission.id}: ${mission.title}`,
      }),
    ]);
  } catch (error) {
    await failMission(env, mission.id, `Could not start the workflow: ${errorMessage(error)}`);
  }

  return (await missions.getById(mission.id))!;
}

// Step 1: Hermes turns the directive into assignments.
export async function planMission(env: AgentTeamEnv, missionId: number) {
  const { missions, agents, knowledge, entities, activity } = services(env);
  const { mission, entity } = await loadMission(env, missionId);
  await missions.update(missionId, { status: "planning", error: null });

  const [hermes, team, allEntities, recent] = await Promise.all([
    getOrchestrator(env),
    agents.getActive(),
    entities.getTree(),
    recentMissions(env, missionId),
  ]);
  const teamIds = team.map((agent) => agent.id);
  if (!teamIds.includes(ORCHESTRATOR_ID)) teamIds.unshift(ORCHESTRATOR_ID);

  const { output } = await callAgent(env, {
    model: modelFor(env, hermes),
    instructions: agentInstructions(hermes, companyName(env)),
    context: teamContext(
      await knowledge.getForAgent(hermes, mission.entity_id, { seeEverything: true }),
      allEntities,
    ),
    prompt: planPrompt({ mission, entity, team, recent }),
    schema: planSchema(teamIds),
  });

  // Keep the plan well-formed: unique keys, known agents, and dependencies
  // only on earlier assignments (which also rules out cycles).
  const planned: PlannedTask[] = [];
  for (const task of output.tasks) {
    if (planned.length >= MAX_TASKS) break;
    if (!teamIds.includes(task.agent_id)) continue;
    let key = task.key.trim() || `step-${planned.length + 1}`;
    if (planned.some((existing) => existing.step_key === key)) {
      key = `${key}-${planned.length + 1}`;
    }
    const earlier = new Set(planned.map((existing) => existing.step_key));
    planned.push({
      step_key: key,
      agent_id: task.agent_id,
      title: task.title,
      instructions: task.instructions,
      depends_on: [...new Set(task.depends_on)].filter((dep) => earlier.has(dep)),
    });
  }
  if (!planned.length) {
    planned.push({
      step_key: "deliver",
      agent_id: ORCHESTRATOR_ID,
      title: output.title || mission.title,
      instructions: mission.directive,
      depends_on: [],
    });
  }

  const tasks = await missions.replaceTasks(missionId, planned);
  const renamed = mission.title === titleFromDirective(mission.directive);
  await env.DB.batch([
    missions.updateStatement(missionId, {
      status: "executing",
      plan_summary: output.summary,
      ...(renamed && output.title ? { title: output.title.slice(0, 120) } : {}),
    }),
    activity.statement({
      mission_id: missionId,
      agent_id: ORCHESTRATOR_ID,
      kind: "mission.planned",
      message: `Hermes planned mission #${missionId} with ${tasks.length} assignment${tasks.length === 1 ? "" : "s"}`,
    }),
  ]);

  return tasks.map((task) => ({
    id: task.id,
    step_key: task.step_key,
    agent_id: task.agent_id,
    depends_on: task.depends_on,
  }));
}

// Step 2: one specialist completes one assignment.
export async function executeTask(env: AgentTeamEnv, taskId: number) {
  const { missions, agents, knowledge, entities, activity } = services(env);
  const task = await missions.getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  if (task.status === "completed") return { taskId, status: task.status };

  const { mission, entity } = await loadMission(env, task.mission_id);
  const [allAgents, allEntities, siblings] = await Promise.all([
    agents.getAll(),
    entities.getTree(),
    missions.getTasks(task.mission_id),
  ]);
  const byId = new Map(allAgents.map((agent) => [agent.id, agent]));
  const agent = byId.get(task.agent_id);
  if (!agent) throw new Error(`Agent ${task.agent_id} not found`);

  await missions.markTaskRunning(taskId);

  const { output } = await callAgent(env, {
    model: modelFor(env, agent),
    instructions: agentInstructions(agent, companyName(env)),
    context: teamContext(
      await knowledge.getForAgent(agent, mission.entity_id),
      allEntities,
    ),
    prompt: taskPrompt({
      mission,
      entity,
      task,
      dependencies: siblings.filter((sibling) =>
        task.depends_on.includes(sibling.step_key),
      ),
      siblings,
      agents: byId,
    }),
    schema: resultSchema,
  });

  // Save the work and the learnings together so a retried step can't record
  // the same learnings twice.
  await env.DB.batch([
    missions.completeTaskStatement(taskId, {
      summary: output.summary,
      output: output.deliverable,
      decisions: output.decisions_needed,
    }),
    ...output.learnings.map((learning) =>
      knowledge.insertStatement({
        title: learning.title,
        content: learning.content,
        scope: learning.share_with === "team" ? "global" : "department",
        scope_ref: agent.department,
        source: "agent",
        author_agent_id: agent.id,
        mission_id: mission.id,
      }),
    ),
    activity.statement({
      mission_id: mission.id,
      agent_id: agent.id,
      kind: "task.completed",
      message: `${agent.name} completed "${task.title}"${output.learnings.length ? ` and recorded ${output.learnings.length} learning${output.learnings.length === 1 ? "" : "s"}` : ""}`,
    }),
  ]);

  return { taskId, status: "completed" as const };
}

export async function endTask(
  env: AgentTeamEnv,
  taskId: number,
  status: "failed" | "skipped",
  reason: string,
) {
  const { missions, activity } = services(env);
  const task = await missions.getTask(taskId);
  if (!task) return;
  await missions.endTask(taskId, status, reason);
  await activity.log({
    mission_id: task.mission_id,
    agent_id: task.agent_id,
    kind: `task.${status}`,
    message: `"${task.title}" ${status === "failed" ? "failed" : "was skipped"}: ${reason}`,
  });
}

// Step 3: Hermes turns the team's work into the Founder's brief.
export async function synthesizeMission(env: AgentTeamEnv, missionId: number) {
  const { missions, agents, knowledge, entities, activity } = services(env);
  const { mission, entity } = await loadMission(env, missionId);
  await missions.update(missionId, { status: "synthesizing" });

  const [hermes, allAgents, allEntities, tasks, recent] = await Promise.all([
    getOrchestrator(env),
    agents.getAll(),
    entities.getTree(),
    missions.getTasks(missionId),
    recentMissions(env, missionId),
  ]);

  if (!tasks.some((task) => task.status === "completed")) {
    throw new Error("Every assignment failed, so there is nothing to brief.");
  }

  const { output } = await callAgent(env, {
    model: modelFor(env, hermes),
    instructions: agentInstructions(hermes, companyName(env)),
    context: teamContext(
      await knowledge.getForAgent(hermes, mission.entity_id, { seeEverything: true }),
      allEntities,
    ),
    prompt: briefPrompt({
      mission,
      entity,
      tasks,
      agents: new Map(allAgents.map((agent) => [agent.id, agent])),
      recent,
    }),
    schema: briefSchema,
  });

  await env.DB.batch([
    missions.updateStatement(missionId, {
      status: "completed",
      brief: output.brief,
      decisions: output.decisions,
    }),
    activity.statement({
      mission_id: missionId,
      agent_id: ORCHESTRATOR_ID,
      kind: "mission.completed",
      message: `Mission #${missionId} completed${output.decisions.length ? `: ${output.decisions.length} decision${output.decisions.length === 1 ? "" : "s"} for the Founder` : ""}`,
    }),
  ]);
}

export async function failMission(
  env: AgentTeamEnv,
  missionId: number,
  reason: string,
) {
  const { missions, activity } = services(env);
  await env.DB.batch([
    missions.updateStatement(missionId, { status: "failed", error: reason }),
    activity.statement({
      mission_id: missionId,
      kind: "mission.failed",
      message: `Mission #${missionId} failed: ${reason}`,
    }),
  ]);
}

export const isActive = (mission: Mission) =>
  !["completed", "failed"].includes(mission.status);
