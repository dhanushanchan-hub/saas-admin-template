import type {
  Decision,
  Mission,
  MissionOrigin,
  MissionPriority,
  MissionStatus,
  Task,
} from "../agents/types";

type MissionRow = Omit<Mission, "decisions"> & { decisions: string | null };
type TaskRow = Omit<Task, "depends_on" | "decisions"> & {
  depends_on: string;
  decisions: string | null;
};

const IN_FLIGHT = `status IN ('queued', 'planning', 'executing', 'synthesizing')`;

const parseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const toMission = (row: MissionRow): Mission => ({
  ...row,
  decisions: parseJson<Decision[]>(row.decisions, []),
});

const toTask = (row: TaskRow): Task => ({
  ...row,
  depends_on: parseJson<string[]>(row.depends_on, []),
  decisions: parseJson<string[]>(row.decisions, []),
});

export type PlannedTask = {
  step_key: string;
  agent_id: string;
  title: string;
  instructions: string;
  depends_on: string[];
};

export class MissionService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll({
    limit = 50,
    status,
  }: { limit?: number; status?: MissionStatus } = {}) {
    const response = status
      ? await this.DB.prepare(
          `SELECT * FROM missions WHERE status = ? ORDER BY id DESC LIMIT ?`,
        )
          .bind(status, limit)
          .all<MissionRow>()
      : await this.DB.prepare(`SELECT * FROM missions ORDER BY id DESC LIMIT ?`)
          .bind(limit)
          .all<MissionRow>();
    return response.results.map(toMission);
  }

  async getById(id: number) {
    const row = await this.DB.prepare(`SELECT * FROM missions WHERE id = ?`)
      .bind(id)
      .first<MissionRow>();
    return row ? toMission(row) : null;
  }

  async getStats() {
    const row = await this.DB.prepare(
      `SELECT
        SUM(CASE WHEN ${IN_FLIGHT} THEN 1 ELSE 0 END) AS in_flight,
        SUM(CASE WHEN status = 'completed' AND completed_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS completed_24h,
        SUM(CASE WHEN status = 'failed' AND updated_at >= datetime('now', '-1 day') THEN 1 ELSE 0 END) AS failed_24h,
        COUNT(*) AS total
       FROM missions`,
    ).first<{
      in_flight: number | null;
      completed_24h: number | null;
      failed_24h: number | null;
      total: number;
    }>();
    return {
      in_flight: row?.in_flight ?? 0,
      completed_24h: row?.completed_24h ?? 0,
      failed_24h: row?.failed_24h ?? 0,
      total: row?.total ?? 0,
    };
  }

  // The mission that finished most recently, for the latest brief.
  async getLatestCompleted() {
    const row = await this.DB.prepare(
      `SELECT * FROM missions WHERE status = 'completed'
       ORDER BY completed_at DESC, id DESC LIMIT 1`,
    ).first<MissionRow>();
    return row ? toMission(row) : null;
  }

  // Mission counts for each entity. Missions for the whole group have a null
  // entity_id.
  async getCountsByEntity() {
    const response = await this.DB.prepare(
      `SELECT entity_id, COUNT(*) AS total,
        SUM(CASE WHEN ${IN_FLIGHT} THEN 1 ELSE 0 END) AS in_flight
       FROM missions GROUP BY entity_id`,
    ).all<{ entity_id: string | null; total: number; in_flight: number }>();
    return response.results;
  }

  // Missions any of these agents has an assignment on, plus missions whose
  // directive starts with `prefix` (so a request shows up before it's
  // planned), newest first.
  async getForTeam(
    agentIds: string[],
    { prefix, limit = 20 }: { prefix?: string; limit?: number } = {},
  ) {
    if (!agentIds.length && !prefix) return [];
    const response = await this.DB.prepare(
      `SELECT * FROM missions
       WHERE id IN (SELECT mission_id FROM tasks WHERE agent_id IN (SELECT value FROM json_each(?)))
          OR (? IS NOT NULL AND instr(directive, ?) = 1)
       ORDER BY id DESC LIMIT ?`,
    )
      .bind(JSON.stringify(agentIds), prefix ?? null, prefix ?? null, limit)
      .all<MissionRow>();
    return response.results.map(toMission);
  }

  // Decisions from recently completed missions, newest first. These are what
  // the Founder still needs to weigh in on.
  async getOpenDecisions(limit = 10) {
    const missions = await this.getAll({ limit, status: "completed" });
    return missions.flatMap((mission) =>
      mission.decisions.map((decision) => ({ mission, decision })),
    );
  }

  async create(mission: {
    title: string;
    directive: string;
    entity_id?: string | null;
    priority?: MissionPriority;
    origin?: MissionOrigin;
    routine_id?: string | null;
  }) {
    const response = await this.DB.prepare(
      `INSERT INTO missions (title, directive, entity_id, priority, origin, routine_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        mission.title,
        mission.directive,
        mission.entity_id || null,
        mission.priority || "normal",
        mission.origin || "founder",
        mission.routine_id || null,
      )
      .run();
    return (await this.getById(response.meta.last_row_id))!;
  }

  updateStatement(
    id: number,
    changes: Partial<{
      title: string;
      status: MissionStatus;
      plan_summary: string;
      brief: string;
      decisions: Decision[];
      error: string | null;
      workflow_instance_id: string;
    }>,
  ) {
    const fields = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [
        key,
        key === "decisions" ? JSON.stringify(value) : value,
      ]);
    const terminal =
      changes.status === "completed" || changes.status === "failed";
    const assignments = [
      ...fields.map(([key]) => `${key} = ?`),
      ...(terminal ? ["completed_at = CURRENT_TIMESTAMP"] : []),
    ].join(", ");
    return this.DB.prepare(
      `UPDATE missions SET ${assignments} WHERE id = ?`,
    ).bind(...fields.map(([, value]) => value), id);
  }

  async update(id: number, changes: Parameters<MissionService["updateStatement"]>[1]) {
    await this.updateStatement(id, changes).run();
  }

  // Tasks

  async getTasks(missionId: number) {
    const response = await this.DB.prepare(
      `SELECT * FROM tasks WHERE mission_id = ? ORDER BY position ASC`,
    )
      .bind(missionId)
      .all<TaskRow>();
    return response.results.map(toTask);
  }

  async getTask(id: number) {
    const row = await this.DB.prepare(`SELECT * FROM tasks WHERE id = ?`)
      .bind(id)
      .first<TaskRow>();
    return row ? toTask(row) : null;
  }

  async getTasksByAgent(agentId: string, limit = 20) {
    const response = await this.DB.prepare(
      `SELECT * FROM tasks WHERE agent_id = ? ORDER BY id DESC LIMIT ?`,
    )
      .bind(agentId, limit)
      .all<TaskRow>();
    return response.results.map(toTask);
  }

  // How many assignments each agent is working on right now.
  async getRunningTaskCounts() {
    const response = await this.DB.prepare(
      `SELECT agent_id, COUNT(*) AS running FROM tasks
       WHERE status = 'running' GROUP BY agent_id`,
    ).all<{ agent_id: string; running: number }>();
    return response.results;
  }

  // Replaces a mission's plan. Safe to repeat if the planning step retries.
  async replaceTasks(missionId: number, tasks: PlannedTask[]) {
    await this.DB.batch([
      this.DB.prepare(`DELETE FROM tasks WHERE mission_id = ?`).bind(missionId),
      ...tasks.map((task, position) =>
        this.DB.prepare(
          `INSERT INTO tasks
            (mission_id, step_key, position, agent_id, title, instructions, depends_on)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          missionId,
          task.step_key,
          position,
          task.agent_id,
          task.title,
          task.instructions,
          JSON.stringify(task.depends_on),
        ),
      ),
    ]);
    return this.getTasks(missionId);
  }

  async markTaskRunning(id: number) {
    await this.DB.prepare(
      `UPDATE tasks SET status = 'running', error = NULL,
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP)
       WHERE id = ?`,
    )
      .bind(id)
      .run();
  }

  completeTaskStatement(
    id: number,
    result: { summary: string; output: string; decisions: string[] },
  ) {
    return this.DB.prepare(
      `UPDATE tasks SET status = 'completed', summary = ?, output = ?,
        decisions = ?, error = NULL, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(result.summary, result.output, JSON.stringify(result.decisions), id);
  }

  async endTask(id: number, status: "failed" | "skipped", error: string) {
    await this.DB.prepare(
      `UPDATE tasks SET status = ?, error = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
      .bind(status, error, id)
      .run();
  }
}
