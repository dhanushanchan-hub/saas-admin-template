-- Migration number: 0007 	 2026-09-28T15:00:00.000Z
-- TIVA Cloud: the Founder's handoffs to outside agent platforms. Manus runs in
-- Manus's cloud and TIVA HQ tracks each task here (external_id/url point at it).
-- The other platforms (Claude Code, Codex, OpenClaw, Hermes Agent, Gemini) run
-- on their own surfaces and connect back through the tiva-agent-team skill; a
-- row records the handoff so the Founder and Hermes can see it in one place.
CREATE TABLE IF NOT EXISTS cloud_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK(platform IN (
        'manus', 'claude-code', 'codex', 'opencode', 'openclaw', 'hermes', 'gemini'
    )),
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    -- The agent profile or model asked for (e.g. a Manus profile). Optional.
    profile TEXT,
    -- queued: created here. running: the platform is working. completed/failed:
    -- finished. stopped: cancelled. unknown: the platform's state didn't map.
    status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN (
        'queued', 'running', 'completed', 'failed', 'stopped', 'unknown'
    )),
    -- The task id and link on the external platform, once it has one.
    external_id TEXT,
    external_url TEXT,
    -- A short status or error message from the platform, for the Founder.
    detail TEXT,
    origin TEXT NOT NULL DEFAULT 'founder' CHECK(origin IN ('founder', 'hermes', 'api')),
    -- Set when Hermes started this while working a mission or a chat.
    mission_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cloud_runs_created_at ON cloud_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_cloud_runs_platform ON cloud_runs(platform);
