<#
.SYNOPSIS
  The TIVA "monster book": one script that turns a Windows desktop into an
  autonomous, launch-ready workstation wired to the whole TIVA system.

.DESCRIPTION
  Run once, from a clone of this repository, as the Windows user who will use
  the machine. It works through numbered chapters and is safe to re-run — each
  step checks before it acts and never deletes your data.

    1. Base tools .......... git, GitHub CLI, Node LTS, Python, uv, Tailscale
                             (Docker Desktop and VS Code optional)
    2. Agents .............. Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw,
                             Hermes Agent, Wrangler
    3. Connection .......... TIVA HQ URL + token saved as user environment vars
    4. Skill ............... the tiva-agent-team skill into every agent
    5. MCP ................. wires Claude Desktop, Cursor and Claude Code to the
                             bundled TIVA MCP server
    6. Tools ............... optionally brings up the self-hosted stack (Docker)
    7. Shortcuts ........... desktop links to the dashboard
    8. Health .............. verifies everything and prints a launch-ready table

  Most chapters install to the user scope and need no administrator. Docker
  Desktop (chapter 6) needs administrator and a reboot the first time.

.PARAMETER HqUrl
  TIVA HQ base URL, e.g. https://tiva-hq.example.workers.dev

.PARAMETER HqToken
  The API_TOKEN secret configured on the Worker.

.EXAMPLE
  .\tiva-monster-setup.ps1 -HqUrl https://tiva-hq.example.workers.dev -HqToken (Read-Host "API token")

.EXAMPLE
  .\tiva-monster-setup.ps1 -HqUrl https://hq.example.workers.dev -HqToken $t -StartTools -InstallDocker
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$HqUrl,
  [Parameter(Mandatory = $true)][string]$HqToken,
  # Cloudflare Access service token, if TIVA HQ is behind Access.
  [string]$AccessClientId,
  [string]$AccessClientSecret,
  # Skip whole chapters.
  [switch]$SkipTools,
  [switch]$SkipHermes,
  [switch]$SkipMcp,
  [switch]$SkipExtraMcp,
  [switch]$SkipCopilot,
  [switch]$SkipShortcuts,
  # Opt-in extras.
  [switch]$InstallDocker,
  [switch]$InstallVSCode,
  [switch]$StartTools,
  # Folder the filesystem MCP server may read/write (default: your home folder).
  [string]$FilesystemRoot = $env:USERPROFILE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$HqUrl    = $HqUrl.TrimEnd("/")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$results  = [System.Collections.Generic.List[object]]::new()
$log      = Join-Path $env:TEMP ("tiva-monster-setup-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
try { Start-Transcript -Path $log -Append | Out-Null } catch {}

function Chapter($n, $title) {
  Write-Host "`n===== $n. $title =====" -ForegroundColor Cyan
}
function Info($m)  { Write-Host "    $m" -ForegroundColor Gray }
function Good($m)  { Write-Host "    $m" -ForegroundColor Green }
function Warn2($m) { Write-Host "    ! $m" -ForegroundColor Yellow }
function Record($name, $status, $detail) {
  $results.Add([pscustomobject]@{ Component = $name; Status = $status; Detail = $detail })
}

# Runs a block, turning any failure into a warning instead of stopping the book.
function Try-Step($name, [scriptblock]$block) {
  try { & $block; return $true }
  catch { Warn2 ("{0}: {1}" -f $name, $_.Exception.Message); Record $name "error" $_.Exception.Message; return $false }
}

function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
              [Environment]::GetEnvironmentVariable("Path", "User")
}

function Version-Of($cmd) {
  try { return (& $cmd --version 2>$null | Select-Object -First 1) } catch { return $null }
}

# Installs a winget package if the command isn't already present.
function Ensure-Winget($cmd, $id, $label) {
  if (Have $cmd) { Good "$label already installed ($(Version-Of $cmd))"; Record $label "ok" "already installed"; return }
  if (-not (Have winget)) { Warn2 "winget not found; install $label manually"; Record $label "skipped" "winget missing"; return }
  Info "Installing $label ..."
  Try-Step "install $label" {
    winget install --id $id -e --source winget --accept-package-agreements --accept-source-agreements --silent | Out-Null
  } | Out-Null
  Refresh-Path
  if (Have $cmd) { Good "$label installed"; Record $label "ok" "installed" }
  else { Warn2 "$label not on PATH yet (a new terminal may be needed)"; Record $label "check" "restart terminal" }
}

# Installs/updates a global npm package.
function Ensure-Npm($cmd, $pkg, $label) {
  if (-not (Have npm)) { Warn2 "npm not found; skipping $label"; Record $label "skipped" "npm missing"; return }
  if (Have $cmd) { Good "$label already installed ($(Version-Of $cmd))"; Record $label "ok" "already installed"; return }
  Info "Installing $label ($pkg) ..."
  if (Try-Step "install $label" { npm install -g $pkg --no-fund --no-audit | Out-Null }) {
    Refresh-Path
    if (Have $cmd) { Good "$label installed"; Record $label "ok" "installed" }
    else { Record $label "check" "installed; restart terminal" }
  }
}

# Deep PSCustomObject -> hashtable, so JSON merges work on PowerShell 5.1 too.
function ConvertTo-HashtableDeep($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [System.Collections.IEnumerable] -and $obj -isnot [string]) {
    return @($obj | ForEach-Object { ConvertTo-HashtableDeep $_ })
  }
  if ($obj -is [psobject] -and $obj.PSObject.Properties.Count) {
    $h = @{}
    foreach ($p in $obj.PSObject.Properties) { $h[$p.Name] = ConvertTo-HashtableDeep $p.Value }
    return $h
  }
  return $obj
}

# Adds/replaces one MCP server in a client's JSON config, keeping the rest.
function Merge-McpServer($path, $name, $serverConfig) {
  $config = @{}
  if (Test-Path $path) {
    try { $config = ConvertTo-HashtableDeep (Get-Content $path -Raw | ConvertFrom-Json) }
    catch { Warn2 "Couldn't parse $path; leaving it alone"; return $false }
    if ($null -eq $config) { $config = @{} }
  } else {
    New-Item -ItemType Directory -Force -Path (Split-Path $path) | Out-Null
  }
  if (-not $config.ContainsKey("mcpServers")) { $config["mcpServers"] = @{} }
  $config["mcpServers"][$name] = $serverConfig
  ($config | ConvertTo-Json -Depth 20) | Set-Content -Path $path -Encoding UTF8
  return $true
}

Write-Host "TIVA monster setup" -ForegroundColor Magenta
Info "Repository: $repoRoot"
Info "TIVA HQ:    $HqUrl"
Info "Log:        $log"

# ============================================================================
Chapter 1 "Base tools"
# ============================================================================
if ($SkipTools) {
  Warn2 "Skipped (-SkipTools)"
} else {
  Ensure-Winget git    "Git.Git"                 "Git"
  Ensure-Winget gh     "GitHub.cli"              "GitHub CLI"
  Ensure-Winget node   "OpenJS.NodeJS.LTS"       "Node.js LTS"
  Ensure-Winget python "Python.Python.3.12"      "Python"
  Ensure-Winget uv     "astral-sh.uv"            "uv"
  Ensure-Winget tailscale "Tailscale.Tailscale"  "Tailscale"
  if ($InstallVSCode) { Ensure-Winget code "Microsoft.VisualStudioCode" "VS Code" }
  if ($InstallDocker) { Ensure-Winget docker "Docker.DockerDesktop" "Docker Desktop" }
}

# ============================================================================
Chapter 2 "Agents"
# ============================================================================
if ($SkipTools) {
  Warn2 "Skipped (-SkipTools)"
} elseif (-not (Have node)) {
  Warn2 "Node.js is not on PATH yet. Open a new terminal and re-run, or install Node.js first."
  Record "Agents" "blocked" "Node.js missing"
} else {
  Ensure-Npm claude   "@anthropic-ai/claude-code" "Claude Code"
  Ensure-Npm codex    "@openai/codex"             "Codex CLI"
  Ensure-Npm gemini   "@google/gemini-cli"        "Gemini CLI"
  Ensure-Npm opencode "opencode-ai"               "OpenCode"
  Ensure-Npm openclaw "openclaw"                  "OpenClaw"
  Ensure-Npm wrangler "wrangler"                  "Wrangler"
  if (-not $SkipCopilot) {
    Ensure-Npm copilot "@github/copilot" "GitHub Copilot CLI"
    # The Copilot editor extensions, when VS Code is present.
    if (Have code) {
      Try-Step "VS Code Copilot extensions" {
        code --install-extension github.copilot --force | Out-Null
        code --install-extension github.copilot-chat --force | Out-Null
      } | Out-Null
      Record "GitHub Copilot (VS Code)" "ok" "extensions installed"
    }
  }

  if (-not $SkipHermes) {
    if (Have uv) {
      if (Have hermes) { Good "Hermes Agent already installed"; Record "Hermes Agent" "ok" "already installed" }
      else {
        Info "Installing Hermes Agent (uv) ..."
        if (Try-Step "install Hermes Agent" { uv tool install "hermes-agent[anthropic]" | Out-Null }) {
          Refresh-Path
          Record "Hermes Agent" "ok" "installed"
        }
      }
    } else { Warn2 "uv not found; skipping Hermes Agent"; Record "Hermes Agent" "skipped" "uv missing" }
  }
}

# ============================================================================
Chapter 3 "Connection (environment variables)"
# ============================================================================
$settings = @{ TIVA_HQ_URL = $HqUrl; TIVA_HQ_TOKEN = $HqToken }
if ($AccessClientId) {
  $settings.TIVA_HQ_ACCESS_CLIENT_ID = $AccessClientId
  $settings.TIVA_HQ_ACCESS_CLIENT_SECRET = $AccessClientSecret
}
foreach ($name in $settings.Keys) {
  [Environment]::SetEnvironmentVariable($name, $settings[$name], "User")
  Set-Item -Path "Env:$name" -Value $settings[$name]
}
Good "Saved TIVA HQ settings for $env:USERNAME (user scope)"
Record "Environment" "ok" "TIVA_HQ_URL, TIVA_HQ_TOKEN set"

# ============================================================================
Chapter 4 "Skill (tiva-agent-team) into every agent"
# ============================================================================
$skillSource = Join-Path $repoRoot "integrations\agent-skills\tiva-agent-team"
if (-not (Test-Path $skillSource)) {
  Warn2 "Skill source not found at $skillSource"
  Record "Skill" "error" "source missing"
} else {
  $skillTargets = @(
    ".claude\skills\tiva-agent-team",
    ".codex\skills\tiva-agent-team",
    ".agents\skills\tiva-agent-team",
    ".hermes\skills\tiva-agent-team"
  )
  foreach ($rel in $skillTargets) {
    $target = Join-Path $env:USERPROFILE $rel
    Try-Step "install skill -> $rel" {
      New-Item -ItemType Directory -Force -Path $target | Out-Null
      Copy-Item -Path (Join-Path $skillSource "*") -Destination $target -Recurse -Force
    } | Out-Null
  }
  Good "Skill installed for Claude Code, Codex, OpenClaw and Hermes Agent"
  Record "Skill" "ok" "installed into 4 agents"
}

# ============================================================================
Chapter 5 "MCP (Claude Desktop, Cursor, Claude Code)"
# ============================================================================
if ($SkipMcp) {
  Warn2 "Skipped (-SkipMcp)"
} else {
  $mcpEntry = Join-Path $repoRoot "integrations\mcp\tiva-mcp.mjs"
  if (-not (Test-Path $mcpEntry)) {
    Warn2 "MCP server not found at $mcpEntry"
    Record "MCP" "error" "server missing"
  } else {
    $mcpEnv = @{ TIVA_HQ_URL = $HqUrl; TIVA_HQ_TOKEN = $HqToken }
    if ($AccessClientId) {
      $mcpEnv.TIVA_HQ_ACCESS_CLIENT_ID = $AccessClientId
      $mcpEnv.TIVA_HQ_ACCESS_CLIENT_SECRET = $AccessClientSecret
    }
    $server = @{ command = "node"; args = @($mcpEntry); env = $mcpEnv }

    $claudeCfg = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
    if (Merge-McpServer $claudeCfg "tiva-hq" $server) { Good "Claude Desktop wired ($claudeCfg)"; Record "MCP: Claude Desktop" "ok" "tiva-hq added" }

    $cursorCfg = Join-Path $env:USERPROFILE ".cursor\mcp.json"
    if (Merge-McpServer $cursorCfg "tiva-hq" $server) { Good "Cursor wired ($cursorCfg)"; Record "MCP: Cursor" "ok" "tiva-hq added" }

    if (Have claude) {
      Try-Step "claude mcp add" {
        claude mcp add tiva-hq --scope user --env "TIVA_HQ_URL=$HqUrl" --env "TIVA_HQ_TOKEN=$HqToken" -- node $mcpEntry 2>$null | Out-Null
      } | Out-Null
      Good "Claude Code wired (claude mcp add tiva-hq)"
      Record "MCP: Claude Code" "ok" "tiva-hq added"
    }

    # Extra MCP servers, so every client gets the browser, GitHub, filesystem
    # and Windows/desktop-control tools too. Each runs on demand via npx; on
    # Windows the reliable form is `cmd /c npx`. GitHub uses the official hosted
    # server through the mcp-remote bridge and signs in with OAuth on first use.
    if (-not $SkipExtraMcp) {
      $extra = @(
        @{ name = "github";            npx = @("mcp-remote", "https://api.githubcopilot.com/mcp/") },
        @{ name = "playwright";        npx = @("@playwright/mcp@latest") },
        @{ name = "filesystem";        npx = @("@modelcontextprotocol/server-filesystem", $FilesystemRoot) },
        @{ name = "desktop-commander"; npx = @("@wonderwhy-er/desktop-commander") }
      )
      foreach ($s in $extra) {
        $cfg = @{ command = "cmd"; args = @("/c", "npx", "-y") + $s.npx }
        Merge-McpServer $claudeCfg $s.name $cfg | Out-Null
        Merge-McpServer $cursorCfg $s.name $cfg | Out-Null
        if (Have claude) {
          Try-Step "claude mcp add $($s.name)" {
            claude mcp add $s.name --scope user -- npx -y @($s.npx) 2>$null | Out-Null
          } | Out-Null
        }
        Record "MCP: $($s.name)" "ok" "wired to Claude Desktop, Cursor, Claude Code"
      }
      Good "Extra MCP servers wired: github, playwright (browser), filesystem, desktop-commander (Windows control)"
    }
  }
}

# ============================================================================
Chapter 6 "Self-hosted tools (Docker)"
# ============================================================================
if ($StartTools) {
  $stack = Join-Path $repoRoot "ops\self-hosted"
  $envFile = Join-Path $stack ".env"
  if (-not (Have docker)) {
    Warn2 "Docker not found. Re-run with -InstallDocker (needs admin + reboot), then -StartTools."
    Record "Self-hosted tools" "blocked" "Docker missing"
  } elseif (-not (Test-Path $envFile)) {
    Warn2 "No .env in ops\self-hosted. Copy .env.example to .env and set the secrets, then re-run with -StartTools."
    Record "Self-hosted tools" "blocked" ".env missing"
  } else {
    Info "Starting the self-hosted stack (docker compose up -d) ..."
    if (Try-Step "docker compose up" { Push-Location $stack; docker compose up -d | Out-Null; Pop-Location }) {
      Good "Self-hosted tools started"
      Record "Self-hosted tools" "ok" "docker compose up -d"
    }
  }
} else {
  Info "Skipped (pass -StartTools to bring up Excalidraw, Memos, NocoDB, etc.)"
}

# ============================================================================
Chapter 7 "Desktop shortcuts"
# ============================================================================
if ($SkipShortcuts) {
  Warn2 "Skipped (-SkipShortcuts)"
} else {
  $desktop = [Environment]::GetFolderPath("Desktop")
  function New-UrlShortcut($name, $url) {
    $path = Join-Path $desktop "$name.url"
    Try-Step "shortcut $name" {
      Set-Content -Path $path -Encoding ASCII -Value @("[InternetShortcut]", "URL=$url")
    } | Out-Null
  }
  New-UrlShortcut "TIVA HQ - Junction" "$HqUrl/admin/junction"
  New-UrlShortcut "TIVA HQ - Hermes"   "$HqUrl/admin/hermes"
  New-UrlShortcut "TIVA HQ - Cloud"    "$HqUrl/admin/cloud"
  Good "Desktop shortcuts created"
  Record "Shortcuts" "ok" "3 links on Desktop"
}

# ============================================================================
Chapter 8 "Health check"
# ============================================================================
Refresh-Path
$checks = @(
  @{ name = "Claude Code"; cmd = "claude" },
  @{ name = "Codex";       cmd = "codex" },
  @{ name = "Gemini CLI";  cmd = "gemini" },
  @{ name = "OpenCode";    cmd = "opencode" },
  @{ name = "OpenClaw";    cmd = "openclaw" },
  @{ name = "Hermes Agent";cmd = "hermes" },
  @{ name = "Wrangler";    cmd = "wrangler" },
  @{ name = "Node.js";     cmd = "node" },
  @{ name = "git";         cmd = "git" }
)
foreach ($c in $checks) {
  if (Have $c.cmd) { Record $c.name "ready" (Version-Of $c.cmd) }
  else { Record $c.name "missing" "not on PATH" }
}

# Live connection test through the skill client.
$tivaCli = Join-Path $env:USERPROFILE ".agents\skills\tiva-agent-team\scripts\tiva.mjs"
if ((Have node) -and (Test-Path $tivaCli)) {
  Info "Testing the connection to TIVA HQ ..."
  Try-Step "connection test" { node $tivaCli brief | Out-Null } | Out-Null
  if ($LASTEXITCODE -eq 0) { Good "Reached TIVA HQ"; Record "TIVA HQ connection" "ready" "brief OK" }
  else { Warn2 "Could not reach TIVA HQ — check the URL/token and that secrets are set on the Worker."; Record "TIVA HQ connection" "check" "brief failed" }
}

Write-Host "`n===== Launch-ready status =====" -ForegroundColor Magenta
$results | Format-Table -AutoSize

try { Stop-Transcript | Out-Null } catch {}

Write-Host @"

Next:
  1. Open a NEW terminal so the new PATH and environment variables load.
  2. Restart Claude Desktop / Cursor so they pick up the TIVA MCP server.
  3. Open your junction:  $HqUrl/admin/junction
  4. Ask any agent (or Claude Desktop): "What's my brief?"

If anything shows 'missing' above, open a new terminal and re-run this script —
it only installs what's absent. Full log: $log
"@ -ForegroundColor Green
