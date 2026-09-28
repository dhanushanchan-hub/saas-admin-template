import {
  classify,
  finishReading,
  readFile,
  type DumpKind,
  type Reading,
} from "../dump/read";

export type DumpStatus = "ready" | "stored" | "failed";

export type DumpFile = {
  id: number;
  name: string;
  mime_type: string;
  size: number;
  kind: DumpKind;
  status: DumpStatus;
  detail: string | null;
  text_chars: number;
  object_key: string | null;
  created_at: string;
};

export type DumpMatch = {
  file_id: number;
  name: string;
  kind: DumpKind;
  excerpt: string;
  content: string;
};

// Search hits mark matched words with these private-use characters, so pages
// can highlight them without rendering file text as HTML.
export const MATCH_START = "";
export const MATCH_END = "";

const CHUNK_CHARS = 2000;
const INSERT_BATCH = 50;

const STOPWORDS = new Set([
  "a", "about", "all", "an", "and", "any", "are", "as", "at", "be", "by", "can",
  "do", "does", "for", "from", "has", "have", "how", "i", "in", "is", "it",
  "its", "me", "my", "of", "on", "or", "our", "please", "so", "tell", "that",
  "the", "this", "to", "us", "was", "we", "what", "when", "where", "which",
  "who", "will", "with", "you", "your",
]);

// Turns free text into a safe FTS5 query: each distinct word is quoted and
// the words are OR-ed, so the best chunks match the most words.
export const matchQuery = (text: string, maxTerms = 16) => {
  const words = (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter(
    (word) => word.length > 1 && !STOPWORDS.has(word),
  );
  return [...new Set(words)]
    .slice(0, maxTerms)
    .map((word) => `"${word}"`)
    .join(" OR ");
};

// Splits text into chunks at whitespace near the size limit. Joining the
// chunks gives back the original text exactly.
export const chunkText = (text: string, size = CHUNK_CHARS) => {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const window = text.slice(end - 200, end);
      const breakAt = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" "));
      if (breakAt > 0) end = end - 200 + breakAt + 1;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
};

const safeObjectName = (name: string) =>
  name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(-120) || "file";

export class DumpService {
  private DB: D1Database;
  private bucket?: R2Bucket;

  constructor(DB: D1Database, bucket?: R2Bucket) {
    this.DB = DB;
    this.bucket = bucket;
  }

  async list({ limit = 200 } = {}) {
    const response = await this.DB.prepare(
      `SELECT * FROM dump_files ORDER BY id DESC LIMIT ?`,
    )
      .bind(limit)
      .all<DumpFile>();
    return response.results;
  }

  async stats() {
    const response = await this.DB.prepare(
      `SELECT status, COUNT(*) AS files, COALESCE(SUM(text_chars), 0) AS chars
       FROM dump_files GROUP BY status`,
    ).all<{ status: DumpStatus; files: number; chars: number }>();
    const rows = response.results;
    return {
      files: rows.reduce((sum, row) => sum + row.files, 0),
      ready: rows.find((row) => row.status === "ready")?.files ?? 0,
      chars: rows.reduce((sum, row) => sum + row.chars, 0),
    };
  }

  async getById(id: number) {
    return this.DB.prepare(`SELECT * FROM dump_files WHERE id = ?`)
      .bind(id)
      .first<DumpFile>();
  }

  async getText(id: number) {
    const response = await this.DB.prepare(
      `SELECT content FROM dump_chunks WHERE file_id = ? ORDER BY seq`,
    )
      .bind(id)
      .all<{ content: string }>();
    return response.results.map((row) => row.content).join("");
  }

  async getOriginal(file: DumpFile) {
    if (!this.bucket || !file.object_key) return null;
    return this.bucket.get(file.object_key);
  }

  // A pasted note: ideas, plans, a chat transcript, anything in text.
  async addNote({ title, content }: { title: string; content: string }) {
    return this.save(
      {
        name: title,
        mime_type: "text/plain",
        size: new TextEncoder().encode(content).length,
        kind: "note",
        object_key: null,
      },
      finishReading(content),
    );
  }

  // An uploaded file: store the original, then read what text we can.
  async addUpload({
    name,
    mimeType,
    size,
    body,
    ai,
  }: {
    name: string;
    mimeType: string;
    size: number;
    body: ReadableStream;
    ai?: Ai;
  }) {
    if (!this.bucket) throw new Error("The DUMP storage bucket isn't connected");
    const month = new Date().toISOString().slice(0, 7);
    const key = `dump/${month}/${crypto.randomUUID()}-${safeObjectName(name)}`;
    await this.bucket.put(key, body, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { name },
    });

    const kind = classify(name, mimeType);
    const bucket = this.bucket;
    const reading = await readFile(ai, {
      name,
      kind,
      size,
      load: async () => {
        const object = await bucket.get(key);
        if (!object) throw new Error("The stored file could not be read back");
        return object.arrayBuffer();
      },
    });

    return this.save({ name, mime_type: mimeType, size, kind, object_key: key }, reading);
  }

  private async save(
    file: Pick<DumpFile, "name" | "mime_type" | "size" | "kind" | "object_key">,
    reading: Reading,
  ) {
    const row = await this.DB.prepare(
      `INSERT INTO dump_files (name, mime_type, size, kind, status, detail, text_chars, object_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
      .bind(
        file.name,
        file.mime_type,
        file.size,
        file.kind,
        reading.status,
        reading.detail,
        reading.text?.length ?? 0,
        file.object_key,
      )
      .first<{ id: number }>();
    const id = row!.id;

    if (reading.text) {
      const chunks = chunkText(reading.text);
      try {
        for (let i = 0; i < chunks.length; i += INSERT_BATCH) {
          await this.DB.batch(
            chunks.slice(i, i + INSERT_BATCH).map((content, offset) =>
              this.DB.prepare(
                `INSERT INTO dump_chunks (content, file_id, seq) VALUES (?, ?, ?)`,
              ).bind(content, id, i + offset),
            ),
          );
        }
      } catch (error) {
        await this.DB.prepare(
          `UPDATE dump_files SET status = 'failed', detail = ? WHERE id = ?`,
        )
          .bind(`Indexing failed: ${error instanceof Error ? error.message : String(error)}`, id)
          .run();
      }
    }

    return (await this.getById(id))!;
  }

  async search(text: string, limit = 20) {
    const query = matchQuery(text);
    if (!query) return [];
    const response = await this.DB.prepare(
      `SELECT dump_chunks.file_id AS file_id, dump_files.name AS name, dump_files.kind AS kind,
              snippet(dump_chunks, 0, '${MATCH_START}', '${MATCH_END}', ' … ', 40) AS excerpt,
              dump_chunks.content AS content
       FROM dump_chunks
       JOIN dump_files ON dump_files.id = dump_chunks.file_id
       WHERE dump_chunks MATCH ?
       ORDER BY bm25(dump_chunks)
       LIMIT ?`,
    )
      .bind(query, limit)
      .all<DumpMatch>();
    return response.results;
  }

  // The chunks most relevant to a piece of work, for an agent's prompt. Never
  // blocks the work: if the dump can't be searched, agents go without it.
  async relevant(text: string, limit = 5) {
    try {
      return await this.search(text, limit);
    } catch (error) {
      console.error("Dump search failed:", error);
      return [];
    }
  }

  async delete(id: number) {
    const file = await this.getById(id);
    if (!file) return false;
    if (file.object_key && this.bucket) await this.bucket.delete(file.object_key);
    await this.DB.batch([
      this.DB.prepare(`DELETE FROM dump_chunks WHERE file_id = ?`).bind(id),
      this.DB.prepare(`DELETE FROM dump_files WHERE id = ?`).bind(id),
    ]);
    return true;
  }
}
