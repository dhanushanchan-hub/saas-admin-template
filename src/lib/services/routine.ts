import type { Routine, RoutineCadence } from "../agents/types";

type RoutineRow = Omit<Routine, "enabled"> & { enabled: number };

const toRoutine = (row: RoutineRow): Routine => ({
  ...row,
  enabled: Boolean(row.enabled),
});

export class RoutineService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll() {
    const response = await this.DB.prepare(
      `SELECT * FROM routines ORDER BY
        CASE cadence WHEN 'hourly' THEN 0 WHEN 'daily' THEN 1 ELSE 2 END,
        hour_utc, name`,
    ).all<RoutineRow>();
    return response.results.map(toRoutine);
  }

  async getById(id: string) {
    const row = await this.DB.prepare(`SELECT * FROM routines WHERE id = ?`)
      .bind(id)
      .first<RoutineRow>();
    return row ? toRoutine(row) : null;
  }

  async update(
    id: string,
    changes: {
      name?: string;
      directive?: string;
      cadence?: RoutineCadence;
      hour_utc?: number;
      weekday?: number;
      enabled?: boolean;
    },
  ) {
    const fields = Object.entries(changes)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, key === "enabled" ? Number(value) : value]);
    if (fields.length) {
      await this.DB.prepare(
        `UPDATE routines SET ${fields.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`,
      )
        .bind(...fields.map(([, value]) => value), id)
        .run();
    }
    return this.getById(id);
  }

  async markRun(id: string, at: string) {
    await this.DB.prepare(`UPDATE routines SET last_run_at = ? WHERE id = ?`)
      .bind(at, id)
      .run();
  }
}
