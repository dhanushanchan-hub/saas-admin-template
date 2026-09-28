import type { Agent, AgentStatus } from "../agents/types";

export class AgentService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll() {
    const response = await this.DB.prepare(
      `SELECT * FROM agents ORDER BY
        CASE tier WHEN 'executive' THEN 0 WHEN 'lead' THEN 1 ELSE 2 END,
        CASE department WHEN 'Office of the Founder' THEN 0 WHEN 'Technology' THEN 1 ELSE 2 END,
        department, name`,
    ).all<Agent>();
    return response.results;
  }

  async getActive() {
    const agents = await this.getAll();
    return agents.filter((agent) => agent.status === "active");
  }

  async getById(id: string) {
    return this.DB.prepare(`SELECT * FROM agents WHERE id = ?`)
      .bind(id)
      .first<Agent>();
  }

  async update(
    id: string,
    changes: {
      status?: AgentStatus;
      charter?: string;
      mission?: string;
      model?: string | null;
    },
  ) {
    const fields = Object.entries(changes).filter(
      ([, value]) => value !== undefined,
    );
    if (!fields.length) return this.getById(id);

    const assignments = fields.map(([key]) => `${key} = ?`).join(", ");
    await this.DB.prepare(`UPDATE agents SET ${assignments} WHERE id = ?`)
      .bind(...fields.map(([, value]) => value), id)
      .run();
    return this.getById(id);
  }
}
