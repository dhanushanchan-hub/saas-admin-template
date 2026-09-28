import type {
  Agent,
  KnowledgeEntry,
  KnowledgeScope,
  KnowledgeSource,
} from "../agents/types";

// How many of the team's own learnings each agent sees. Founder entries are
// always included in full.
const LEARNINGS_PER_AGENT = 20;

export type NewKnowledge = {
  title: string;
  content: string;
  scope: KnowledgeScope;
  scope_ref?: string | null;
  source?: KnowledgeSource;
  author_agent_id?: string | null;
  mission_id?: number | null;
};

export class KnowledgeService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll() {
    const response = await this.DB.prepare(
      `SELECT * FROM knowledge ORDER BY
        CASE source WHEN 'founder' THEN 0 ELSE 1 END, id DESC`,
    ).all<KnowledgeEntry>();
    return response.results;
  }

  // Everything an agent should know before it works: the Founder's entries
  // that apply to it, plus the most recent learnings shared with it.
  // The orchestrator sees every Founder entry so it can route work well.
  async getForAgent(
    agent: Agent,
    entityId: string | null,
    { seeEverything = false } = {},
  ) {
    const relevant = seeEverything
      ? `1 = 1`
      : `(scope = 'global'
          OR (scope = 'department' AND scope_ref = ?1)
          OR (scope = 'agent' AND scope_ref = ?2)
          OR (scope = 'entity' AND scope_ref = ?3))`;

    const [founder, learnings] = await this.DB.batch<KnowledgeEntry>([
      this.DB.prepare(
        `SELECT * FROM knowledge WHERE source = 'founder' AND ${relevant}
         ORDER BY id ASC`,
      ).bind(...(seeEverything ? [] : [agent.department, agent.id, entityId])),
      this.DB.prepare(
        `SELECT * FROM knowledge WHERE source = 'agent' AND ${relevant}
         ORDER BY id DESC LIMIT ${LEARNINGS_PER_AGENT}`,
      ).bind(...(seeEverything ? [] : [agent.department, agent.id, entityId])),
    ]);

    return {
      founder: founder.results,
      learnings: learnings.results.reverse(),
    };
  }

  insertStatement(entry: NewKnowledge) {
    return this.DB.prepare(
      `INSERT INTO knowledge
        (title, content, scope, scope_ref, source, author_agent_id, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      entry.title,
      entry.content,
      entry.scope,
      entry.scope === "global" ? null : entry.scope_ref || null,
      entry.source || "founder",
      entry.author_agent_id || null,
      entry.mission_id ?? null,
    );
  }

  async create(entry: NewKnowledge) {
    const response = await this.insertStatement(entry).run();
    return this.DB.prepare(`SELECT * FROM knowledge WHERE id = ?`)
      .bind(response.meta.last_row_id)
      .first<KnowledgeEntry>();
  }

  async delete(id: number) {
    const response = await this.DB.prepare(`DELETE FROM knowledge WHERE id = ?`)
      .bind(id)
      .run();
    return response.meta.changes > 0;
  }
}
