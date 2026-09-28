import type {
  CloudPlatform,
  CloudRun,
  CloudRunOrigin,
  CloudRunStatus,
} from "../agents/types";

export class CloudRunService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll({
    limit = 50,
    platform,
  }: { limit?: number; platform?: CloudPlatform } = {}) {
    const response = platform
      ? await this.DB.prepare(
          `SELECT * FROM cloud_runs WHERE platform = ? ORDER BY id DESC LIMIT ?`,
        )
          .bind(platform, limit)
          .all<CloudRun>()
      : await this.DB.prepare(`SELECT * FROM cloud_runs ORDER BY id DESC LIMIT ?`)
          .bind(limit)
          .all<CloudRun>();
    return response.results;
  }

  async getById(id: number) {
    return (
      (await this.DB.prepare(`SELECT * FROM cloud_runs WHERE id = ?`)
        .bind(id)
        .first<CloudRun>()) ?? null
    );
  }

  async create(run: {
    platform: CloudPlatform;
    title: string;
    prompt: string;
    profile?: string | null;
    status?: CloudRunStatus;
    external_id?: string | null;
    external_url?: string | null;
    detail?: string | null;
    origin?: CloudRunOrigin;
    mission_id?: number | null;
  }) {
    const response = await this.DB.prepare(
      `INSERT INTO cloud_runs
        (platform, title, prompt, profile, status, external_id, external_url, detail, origin, mission_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        run.platform,
        run.title,
        run.prompt,
        run.profile ?? null,
        run.status ?? "queued",
        run.external_id ?? null,
        run.external_url ?? null,
        run.detail ?? null,
        run.origin ?? "founder",
        run.mission_id ?? null,
      )
      .run();
    return (await this.getById(response.meta.last_row_id))!;
  }

  async update(
    id: number,
    changes: Partial<{
      status: CloudRunStatus;
      external_id: string | null;
      external_url: string | null;
      detail: string | null;
      title: string;
    }>,
  ) {
    const fields = Object.entries(changes).filter(
      ([, value]) => value !== undefined,
    );
    if (!fields.length) return;
    const assignments = [
      ...fields.map(([key]) => `${key} = ?`),
      "updated_at = CURRENT_TIMESTAMP",
    ].join(", ");
    await this.DB.prepare(`UPDATE cloud_runs SET ${assignments} WHERE id = ?`)
      .bind(...fields.map(([, value]) => value), id)
      .run();
  }
}
