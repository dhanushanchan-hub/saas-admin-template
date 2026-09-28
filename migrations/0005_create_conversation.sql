-- Migration number: 0005    2026-09-28T01:00:00.000Z
-- The Founder's running conversation with Hermes (chat and voice).
CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('founder', 'hermes')),
    content TEXT NOT NULL,
    mission_id INTEGER,
    knowledge_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
