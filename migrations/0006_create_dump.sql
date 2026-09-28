-- Migration number: 0006    2026-09-28T02:00:00.000Z
-- The Founder's dump: every file and note dropped into TIVA HQ. Originals live
-- in the DUMP R2 bucket; the text read out of them is indexed below so Hermes
-- and the team can search it.
CREATE TABLE IF NOT EXISTS dump_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0,
    kind TEXT NOT NULL CHECK(kind IN ('note', 'text', 'document', 'image', 'audio', 'video', 'other')),
    -- ready: its text is searchable. stored: kept, but no text could be read.
    -- failed: kept, but reading it raised an error.
    status TEXT NOT NULL CHECK(status IN ('ready', 'stored', 'failed')),
    detail TEXT,
    text_chars INTEGER NOT NULL DEFAULT 0,
    object_key TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Each file's text in ~2,000-character chunks, full-text indexed. Porter
-- stemming lets "launching" find "launch".
CREATE VIRTUAL TABLE IF NOT EXISTS dump_chunks USING fts5(
    content,
    file_id UNINDEXED,
    seq UNINDEXED,
    tokenize = 'porter unicode61'
);
