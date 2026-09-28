#!/usr/bin/env node
// SessionStart hook. Cloud sessions start on a fresh VM, so install the
// SkillSpector CLI there (pinned in .claude/toolkit/sources.json) for the
// skill-inspector skill. Runs in the background. On your own machine it does
// nothing; docs/CLAUDE_CODE_TOOLKIT.md has the one-time local install.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.env.CLAUDE_CODE_REMOTE !== "true") process.exit(0);
if (spawnSync("skillspector", ["--version"]).status === 0) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sources = JSON.parse(fs.readFileSync(path.join(root, ".claude", "toolkit", "sources.json"), "utf8"));
const { repo, ref } = sources.skillspector;
const result = spawnSync("uv", ["tool", "install", "--python", "3.12", `git+${repo}@${ref}`], { stdio: "ignore" });
process.exit(result.status ?? 1);
