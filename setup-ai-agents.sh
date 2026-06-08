#!/usr/bin/env bash
#
# setup-ai-agents.sh
# One-shot installer for Claude Code + OpenAI Codex CLI on a Linux box
# (Oracle Cloud VM: Oracle Linux or Ubuntu). Safe to re-run (idempotent).
#
# Usage:
#   chmod +x setup-ai-agents.sh
#   ./setup-ai-agents.sh
#
# What it does:
#   1. Detects your Linux distro (dnf vs apt) and CPU arch
#   2. Installs Node.js (for the Codex CLI) and git/gh if missing
#   3. Sets up a user-owned npm prefix (no sudo npm -g, avoids EACCES)
#   4. Installs Claude Code (native installer)
#   5. Installs the OpenAI Codex CLI
#   6. Prints next steps for login + connecting your repo + MCP
#
set -euo pipefail

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------------------------------------------------------------------------
# 1. Detect package manager
# ---------------------------------------------------------------------------
if have dnf;      then PKG="sudo dnf install -y"
elif have yum;    then PKG="sudo yum install -y"
elif have apt-get; then PKG="sudo apt-get install -y"; sudo apt-get update -y
else
  warn "No supported package manager (dnf/yum/apt) found. Install Node.js + git manually, then re-run."
  exit 1
fi
log "Using package manager: $PKG"

# ---------------------------------------------------------------------------
# 2. Base tools: curl, git, gh, Node.js
# ---------------------------------------------------------------------------
have curl || $PKG curl
have git  || $PKG git

if ! have node; then
  log "Installing Node.js"
  $PKG nodejs || warn "nodejs package install failed; install Node 18+ manually if Codex install fails"
fi

if ! have gh; then
  log "Installing GitHub CLI (gh) for repo auth"
  $PKG gh || warn "Could not install gh automatically; you can install it later for push/PR support"
fi

# ---------------------------------------------------------------------------
# 3. User-owned npm global prefix (avoids sudo + EACCES)
# ---------------------------------------------------------------------------
if have npm; then
  log "Configuring user-owned npm global prefix (~/.npm-global)"
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global"
  if ! grep -q '.npm-global/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> "$HOME/.bashrc"
  fi
  export PATH="$HOME/.npm-global/bin:$PATH"
fi

# ---------------------------------------------------------------------------
# 4. Claude Code (native installer)
# ---------------------------------------------------------------------------
if have claude; then
  log "Claude Code already installed: $(claude --version 2>/dev/null || echo present)"
else
  log "Installing Claude Code"
  curl -fsSL https://claude.ai/install.sh | bash
fi

# ---------------------------------------------------------------------------
# 5. OpenAI Codex CLI
# ---------------------------------------------------------------------------
if have codex; then
  log "Codex CLI already installed: $(codex --version 2>/dev/null || echo present)"
elif have npm; then
  log "Installing OpenAI Codex CLI"
  npm install -g @openai/codex || warn "Codex install failed — check Node version (needs 18+)"
else
  warn "npm not available; skipped Codex CLI"
fi

# ---------------------------------------------------------------------------
# 6. Next steps
# ---------------------------------------------------------------------------
cat <<'EOF'

============================================================
 Install step done. Reload your shell so PATH updates:

     exec $SHELL -l

 Then verify:
     claude --version
     codex  --version

 --- Log in -------------------------------------------------
   claude        # OAuth: open the printed URL in a browser, paste code back
   codex         # sign in with your ChatGPT/OpenAI account
   gh auth login # GitHub auth for push / PRs

 --- Connect your repo --------------------------------------
   git clone https://github.com/dhanushanchan-hub/saas-admin-template.git
   cd saas-admin-template
   claude        # (or: codex) — auto-detects the git repo

 --- Connect MCP integrations (inside Claude Code) ----------
   claude mcp add github -- npx -y @modelcontextprotocol/server-github
   claude mcp list
   # then run `claude`, type /mcp to finish any OAuth logins
============================================================
EOF
