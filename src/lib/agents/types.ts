// Shared types for the autonomous agent team. Row types mirror the tables in
// migrations/0004_create_agent_team.sql.

export type AgentTier = "executive" | "lead" | "specialist";
export type AgentStatus = "active" | "paused";

export type Agent = {
  id: string;
  name: string;
  title: string;
  department: string;
  tier: AgentTier;
  reports_to: string | null;
  mission: string;
  charter: string;
  model: string | null;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
};

export type EntityKind =
  | "holding"
  | "subholding"
  | "subsidiary"
  | "brand"
  | "venture";

export type Entity = {
  id: string;
  name: string;
  kind: EntityKind;
  parent_id: string | null;
  category: string | null;
  region: string | null;
  jurisdiction: string | null;
  description: string | null;
  created_at: string;
};

export type KnowledgeScope = "global" | "department" | "entity" | "agent";
export type KnowledgeSource = "founder" | "agent";

export type KnowledgeEntry = {
  id: number;
  title: string;
  content: string;
  scope: KnowledgeScope;
  scope_ref: string | null;
  source: KnowledgeSource;
  author_agent_id: string | null;
  mission_id: number | null;
  created_at: string;
};

export type MissionStatus =
  | "queued"
  | "planning"
  | "executing"
  | "synthesizing"
  | "completed"
  | "failed";
export type MissionPriority = "low" | "normal" | "high" | "critical";
export type MissionOrigin = "founder" | "routine" | "api";

export type Decision = {
  question: string;
  recommendation: string;
  owner: string;
};

export type Mission = {
  id: number;
  title: string;
  directive: string;
  entity_id: string | null;
  priority: MissionPriority;
  status: MissionStatus;
  origin: MissionOrigin;
  routine_id: string | null;
  plan_summary: string | null;
  brief: string | null;
  decisions: Decision[];
  error: string | null;
  workflow_instance_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type Task = {
  id: number;
  mission_id: number;
  step_key: string;
  position: number;
  agent_id: string;
  title: string;
  instructions: string;
  depends_on: string[];
  status: TaskStatus;
  summary: string | null;
  output: string | null;
  decisions: string[];
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type RoutineCadence = "hourly" | "daily" | "weekly";

export type Routine = {
  id: string;
  name: string;
  agent_id: string;
  directive: string;
  cadence: RoutineCadence;
  hour_utc: number;
  weekday: number;
  entity_id: string | null;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
};

export type Activity = {
  id: number;
  mission_id: number | null;
  agent_id: string | null;
  kind: string;
  message: string;
  created_at: string;
};

// The subset of the Worker environment the agent team uses. Kept separate from
// the generated `Env` so the workflow and scheduler can be bundled without
// Astro's types.
export type AgentTeamEnv = {
  DB: D1Database;
  MISSION_WORKFLOW: Workflow;
  // The Founder's dump: files in R2, read with Workers AI.
  DUMP?: R2Bucket;
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  AGENT_MODEL?: string;
  COMPANY_NAME?: string;
};

// D1's CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker.
export const parseDbTime = (value: string | null): Date | null =>
  value ? new Date(value.replace(" ", "T") + "Z") : null;

export const toDbTime = (date: Date): string =>
  date.toISOString().slice(0, 19).replace("T", " ");
