import { EntityService } from "../services/entity";
import { KnowledgeService } from "../services/knowledge";
import { MissionService } from "../services/mission";
import { ConversationService } from "../services/conversation";
import { DumpService } from "../services/dump";
import { callAgent, DEFAULT_MODEL } from "./llm";
import { launchMission } from "./orchestrator";
import { dispatchCloudRun } from "./cloud";
import { manusConfigured, ManusError } from "./manus";
import {
  agentInstructions,
  chatPrompt,
  chatSchema,
  filesSection,
  ORCHESTRATOR_ID,
  teamContext,
} from "./prompts";
import { AgentService } from "../services/agent";
import type { AgentTeamEnv, MissionPriority } from "./types";

const HISTORY = 30;
const priorities: MissionPriority[] = ["low", "normal", "high", "critical"];

// One turn of the Founder's conversation with Hermes. Hermes answers, and can
// put the team on a mission or save something to the team's memory.
export async function chatWithHermes(env: AgentTeamEnv, message: string) {
  const agents = new AgentService(env.DB);
  const missions = new MissionService(env.DB);
  const knowledge = new KnowledgeService(env.DB);
  const conversation = new ConversationService(env.DB);

  const hermes = await agents.getById(ORCHESTRATOR_ID);
  if (!hermes) throw new Error(`The orchestrator agent "${ORCHESTRATOR_ID}" is missing`);

  const [entities, recent, history, files] = await Promise.all([
    new EntityService(env.DB).getTree(),
    missions.getAll({ limit: 10 }),
    conversation.getRecent(HISTORY),
    new DumpService(env.DB).relevant(message),
  ]);

  const { output } = await callAgent(env, {
    model: hermes.model || env.AGENT_MODEL || DEFAULT_MODEL,
    instructions: agentInstructions(hermes, env.COMPANY_NAME || "TIVA"),
    context: teamContext(
      await knowledge.getForAgent(hermes, null, { seeEverything: true }),
      entities,
    ),
    prompt: chatPrompt({ history, recent, message, now: new Date() }) + filesSection(files),
    schema: chatSchema,
  });

  let mission = null;
  let entry = null;
  let cloud = null;
  let reply = output.reply;

  if (output.action === "delegate_manus" && output.mission_directive.trim()) {
    if (manusConfigured(env)) {
      try {
        const run = await dispatchCloudRun(env, {
          platform: "manus",
          prompt: output.mission_directive.trim(),
          title: output.mission_title.trim() || undefined,
          origin: "hermes",
        });
        cloud = { id: run.id, title: run.title, url: run.external_url };
        if (run.external_url) {
          reply += `\n\nManus is on it: ${run.external_url}`;
        }
      } catch (error) {
        // Don't lose Hermes's reply if Manus is unavailable; tell the Founder.
        reply += `\n\n(I couldn't reach Manus just now: ${
          error instanceof ManusError ? error.message : "unexpected error"
        })`;
      }
    } else {
      reply +=
        "\n\n(Manus isn't connected yet — set the MANUS_API_KEY secret and I'll be able to send it there.)";
    }
  } else if (output.action === "start_mission" && output.mission_directive.trim()) {
    const entityId = entities.some((entity) => entity.id === output.mission_entity_id)
      ? output.mission_entity_id
      : null;
    mission = await launchMission(env, {
      directive: output.mission_directive.trim(),
      title: output.mission_title.trim() || undefined,
      entity_id: entityId,
      priority: priorities.includes(output.mission_priority as MissionPriority)
        ? (output.mission_priority as MissionPriority)
        : "normal",
      origin: "founder",
    });
  } else if (output.action === "remember" && output.memory_content.trim()) {
    const content = output.memory_content.trim();
    entry = await knowledge.create({
      title: (output.memory_title.trim() || content.split("\n")[0]).slice(0, 200),
      content,
      scope: "global",
      source: "founder",
    });
  }

  await env.DB.batch([
    conversation.insertStatement({ role: "founder", content: message }),
    conversation.insertStatement({
      role: "hermes",
      content: reply,
      mission_id: mission?.id,
      knowledge_id: entry?.id,
    }),
  ]);

  return {
    reply,
    mission: mission ? { id: mission.id, title: mission.title, status: mission.status } : null,
    memory: entry ? { id: entry.id, title: entry.title } : null,
    cloud,
  };
}
