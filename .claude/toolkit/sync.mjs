#!/usr/bin/env node
// Vendors the third-party Claude Code tools listed in sources.json into this
// repo's .claude/ folder. Cloud sessions (claude.ai/code and the Claude app)
// load skills, hooks and .mcp.json from the repo but never install plugins, so
// the tools live here as plain files. Needs Node 22+ and git.
//
//   node .claude/toolkit/sync.mjs            Copy every tool at its pinned commit
//   node .claude/toolkit/sync.mjs --latest   Move every pin to the upstream default branch first
//
// Then rescan what changed before committing (see docs/CLAUDE_CODE_TOOLKIT.md):
//   skillspector scan .claude/skills --recursive --no-llm \
//     --baseline .claude/toolkit/skillspector-baseline.yaml --fail-on-findings

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const sourcesPath = path.join(here, "sources.json");
const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
const latest = process.argv.includes("--latest");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const git = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// Pin `npx <package>` to the plugin's own release, so the MCP server can't
// change underneath a skill that is pinned to a commit.
const pinNpx = (server, version) => {
  const i = server.command === "npx" ? server.args.findIndex((arg) => !arg.startsWith("-")) : -1;
  if (i >= 0 && server.args[i].lastIndexOf("@") <= 0) server.args[i] = `${server.args[i]}@${version}`;
  return server;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-toolkit-"));
try {
  for (const [name, source] of Object.entries(sources)) {
    const checkout = path.join(tmp, name);
    fs.mkdirSync(checkout);
    git(["init", "-q"], checkout);
    git(["fetch", "-q", "--depth", "1", source.repo, latest ? "HEAD" : source.ref], checkout);
    git(["checkout", "-q", "FETCH_HEAD"], checkout);
    source.ref = git(["rev-parse", "HEAD"], checkout);

    for (const [from, to] of Object.entries(source.copy)) {
      const dest = path.join(root, to);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(path.join(checkout, from), dest, { recursive: true });
    }

    fs.mkdirSync(path.join(here, "licenses"), { recursive: true });
    fs.copyFileSync(path.join(checkout, source.license), path.join(here, "licenses", `${name}.txt`));

    for (const patch of source.patches ?? []) {
      const file = path.join(root, patch.file);
      const text = fs.readFileSync(file, "utf8");
      if (text.split(patch.find).length !== 2) {
        fail(`${name}: patch anchor not found once in ${patch.file}; upstream changed, update sources.json.\n  ${patch.find}`);
      }
      fs.writeFileSync(file, text.replace(patch.find, patch.replace));
    }

    if (source.mcpServers) {
      const manifest = readJson(path.join(checkout, source.mcpServers));
      const mcpPath = path.join(root, ".mcp.json");
      const mcp = fs.existsSync(mcpPath) ? readJson(mcpPath) : { mcpServers: {} };
      for (const [id, server] of Object.entries(manifest.mcpServers)) {
        mcp.mcpServers[id] = pinNpx(server, manifest.version);
      }
      writeJson(mcpPath, mcp);
    }

    console.log(`${name.padEnd(13)} ${source.ref.slice(0, 7)}  ${source.repo}`);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

writeJson(sourcesPath, sources);
