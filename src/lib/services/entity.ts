import type { Entity, EntityKind } from "../agents/types";

export type EntityNode = Entity & { depth: number };

// Orders entities parent-first (depth-first), so the group's structure reads
// top-down: holding, then each category holding and the businesses under it.
export const toTree = (entities: Entity[]): EntityNode[] => {
  const ids = new Set(entities.map((entity) => entity.id));
  const childrenOf = (parentId: string | null) =>
    entities.filter((entity) =>
      parentId === null
        ? !entity.parent_id || !ids.has(entity.parent_id)
        : entity.parent_id === parentId,
    );

  const ordered: EntityNode[] = [];
  const seen = new Set<string>();
  const visit = (entity: Entity, depth: number) => {
    if (seen.has(entity.id)) return;
    seen.add(entity.id);
    ordered.push({ ...entity, depth });
    childrenOf(entity.id).forEach((child) => visit(child, depth + 1));
  };
  childrenOf(null).forEach((root) => visit(root, 0));
  return ordered;
};

export class EntityService {
  private DB: D1Database;

  constructor(DB: D1Database) {
    this.DB = DB;
  }

  async getAll() {
    const response = await this.DB.prepare(
      `SELECT * FROM entities ORDER BY
        CASE kind WHEN 'holding' THEN 0 WHEN 'subholding' THEN 1 ELSE 2 END, name`,
    ).all<Entity>();
    return response.results;
  }

  async getTree() {
    return toTree(await this.getAll());
  }

  async getById(id: string) {
    return this.DB.prepare(`SELECT * FROM entities WHERE id = ?`)
      .bind(id)
      .first<Entity>();
  }

  async create(entity: {
    id: string;
    name: string;
    kind: EntityKind;
    parent_id?: string | null;
    category?: string;
    region?: string;
    jurisdiction?: string;
    description?: string;
  }) {
    await this.DB.prepare(
      `INSERT INTO entities
        (id, name, kind, parent_id, category, region, jurisdiction, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        entity.id,
        entity.name,
        entity.kind,
        entity.parent_id || null,
        entity.category || null,
        entity.region || null,
        entity.jurisdiction || null,
        entity.description || null,
      )
      .run();
    return this.getById(entity.id);
  }
}
