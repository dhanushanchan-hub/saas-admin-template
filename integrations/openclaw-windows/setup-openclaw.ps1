<#
.SYNOPSIS
  Sets up OpenClaw on a Windows desktop (for example the Azure Windows VM) and
  connects it to the TIVA HQ agent team.

.DESCRIPTION
  1. Installs OpenClaw with its official installer, unless it's already installed.
  2. Installs the tiva-agent-team skill into %USERPROFILE%\.agents\skills.
  3. Saves the TIVA HQ URL and API token as user environment variables.
  4. Checks the connection by fetching the Founder's briefing.

  Run it from a clone of the repository, in a normal (non-admin) PowerShell
  window, as the Windows user that runs OpenClaw.

.EXAMPLE
  .\setup-openclaw.ps1 -HqUrl https://tiva-hq.example.workers.dev -HqToken (Read-Host "API token")
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$HqUrl,
  [Parameter(Mandatory = $true)][string]$HqToken,
  # Cloudflare Access service token, if TIVA HQ is protected by Access.
  [string]$AccessClientId,
  [string]$AccessClientSecret,
  [switch]$SkipOpenClawInstall
)

$ErrorActionPreference = "Stop"

function Step($message) { Write-Host "`n==> $message" -ForegroundColor Cyan }

# 1. OpenClaw
if (-not $SkipOpenClawInstall) {
  if (Get-Command openclaw -ErrorAction SilentlyContinue) {
    Step "OpenClaw is already installed ($(openclaw --version))"
  } else {
    Step "Installing OpenClaw with the official installer"
    Invoke-Expression (Invoke-WebRequest -UseBasicParsing https://openclaw.ai/install.ps1).Content
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js was not found on PATH. OpenClaw's installer normally provides it; install Node.js 24 or newer and run this script again."
}

# 2. Skill
$source = Join-Path $PSScriptRoot "..\agent-skills\tiva-agent-team"
$target = Join-Path $env:USERPROFILE ".agents\skills\tiva-agent-team"
Step "Installing the tiva-agent-team skill to $target"
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force

# 3. Credentials, as user environment variables (never written to the repo)
Step "Saving TIVA HQ settings for $env:USERNAME"
$settings = @{
  TIVA_HQ_URL   = $HqUrl.TrimEnd("/")
  TIVA_HQ_TOKEN = $HqToken
}
if ($AccessClientId) {
  $settings.TIVA_HQ_ACCESS_CLIENT_ID = $AccessClientId
  $settings.TIVA_HQ_ACCESS_CLIENT_SECRET = $AccessClientSecret
}
foreach ($name in $settings.Keys) {
  [Environment]::SetEnvironmentVariable($name, $settings[$name], "User")
  Set-Item -Path "Env:$name" -Value $settings[$name]
}

# 4. Connection check
Step "Checking the connection to TIVA HQ"
node (Join-Path $target "scripts\tiva.mjs") brief
if ($LASTEXITCODE -ne 0) { throw "Could not reach TIVA HQ. Check the URL and token, then run this script again." }

Step "Done"
Write-Host @"
Next:
  1. If this is OpenClaw's first run on this machine:  openclaw onboard --install-daemon
  2. Restart OpenClaw (or sign out and back in) so it picks up the new environment variables.
  3. Open the OpenClaw dashboard:                        openclaw dashboard
     Then ask it things like "What's my brief?" or "Have the team plan the Master ID launch".
  4. TIVA HQ's own dashboard:                            $($settings.TIVA_HQ_URL)/admin/command
"@
