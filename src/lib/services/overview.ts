export type OverviewCounts = {
  knowledge_founder: number;
  knowledge_learned: number;
  messages: number;
  last_message_at: string | null;
  customers: number;
  plans: number;
  active_subscriptions: number;
};

export const EMPTY_COUNTS: OverviewCounts = {
  knowledge_founder: 0,
  knowledge_learned: 0,
  messages: 0,
  last_message_at: null,
  customers: 0,
  plans: 0,
  active_subscriptions: 0,
};

// Headline counts for the Master Dashboard from the parts of TIVA HQ whose
// services don't already provide them, in one query.
export class OverviewService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getCounts() {
    const row = await this.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM knowledge WHERE source = 'founder') AS knowledge_founder,
        (SELECT COUNT(*) FROM knowledge WHERE source = 'agent') AS knowledge_learned,
        (SELECT COUNT(*) FROM conversation_messages) AS messages,
        (SELECT MAX(created_at) FROM conversation_messages) AS last_message_at,
        (SELECT COUNT(*) FROM customers) AS customers,
        (SELECT COUNT(*) FROM subscriptions) AS plans,
        (SELECT COUNT(*) FROM customer_subscriptions WHERE status = 'active') AS active_subscriptions`,
    ).first<OverviewCounts>();
    return row ?? EMPTY_COUNTS;
  }
}
