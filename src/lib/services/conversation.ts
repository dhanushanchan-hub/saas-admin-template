export type ConversationMessage = {
  id: number;
  role: "founder" | "hermes";
  content: string;
  mission_id: number | null;
  knowledge_id: number | null;
  created_at: string;
};

export class ConversationService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  // Most recent messages, oldest first.
  async getRecent(limit = 30) {
    const response = await this.DB.prepare(
      `SELECT * FROM conversation_messages ORDER BY id DESC LIMIT ?`,
    )
      .bind(limit)
      .all<ConversationMessage>();
    return response.results.reverse();
  }

  insertStatement(message: {
    role: ConversationMessage["role"];
    content: string;
    mission_id?: number | null;
    knowledge_id?: number | null;
  }) {
    return this.DB.prepare(
      `INSERT INTO conversation_messages (role, content, mission_id, knowledge_id)
       VALUES (?, ?, ?, ?)`,
    ).bind(
      message.role,
      message.content,
      message.mission_id ?? null,
      message.knowledge_id ?? null,
    );
  }
}
