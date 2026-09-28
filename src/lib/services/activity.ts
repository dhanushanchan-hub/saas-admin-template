import type { Activity } from "../agents/types";

export class ActivityService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  statement(entry: {
    kind: string;
    message: string;
    mission_id?: number | null;
    agent_id?: string | null;
  }) {
    return this.DB.prepare(
      `INSERT INTO activity (mission_id, agent_id, kind, message) VALUES (?, ?, ?, ?)`,
    ).bind(
      entry.mission_id ?? null,
      entry.agent_id ?? null,
      entry.kind,
      entry.message,
    );
  }

  async log(entry: Parameters<ActivityService["statement"]>[0]) {
    await this.statement(entry).run();
  }

  async getRecent(limit = 25) {
    const response = await this.DB.prepare(
      `SELECT * FROM activity ORDER BY id DESC LIMIT ?`,
    )
      .bind(limit)
      .all<Activity>();
    return response.results;
  }
}
