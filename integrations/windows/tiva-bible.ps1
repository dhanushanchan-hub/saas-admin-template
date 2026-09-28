<#
.SYNOPSIS
  TIVA Bible: one run sets up the Founder's Windows PC for the TIVA AI agents
  (Claude Code, Kimi Code, OpenClaw), then cleans, repairs and organizes it.

.DESCRIPTION
  Paste into PowerShell (a normal window, not "Run as administrator"):

    irm https://raw.githubusercontent.com/dhanushanchan-hub/saas-admin-template/main/integrations/windows/tiva-bible.ps1 -OutFile $env:TEMP\tiva-bible.ps1; powershell -NoProfile -ExecutionPolicy Bypass -File $env:TEMP\tiva-bible.ps1

  It asks for the TIVA HQ token (Enter skips), then Windows asks once for
  admin rights. After that it runs on its own for 30 to 90 minutes.

  Admin part, one approval:
    restore point; Git, GitHub CLI and Node.js LTS through winget; Windows temp
    files older than 2 days, error reports, crash dumps, Delivery Optimization
    and DNS caches, superseded Windows components; broken shortcuts on the
    Public desktop and All Users Start menu to quarantine; DISM RestoreHealth,
    SFC and a read-only disk scan; Defender update and quick scan;
    winget upgrade --all.

  Your part:
    your temp files and crash dumps older than 2 days; uv, Claude Code, Kimi
    Code and OpenClaw from their official installers; the TIVA repo in ~\TIVA
    and SkillSpector; the repo's skills shared with Kimi Code and OpenClaw;
    Claude Code and Kimi Code connected to OpenClaw over MCP; the TIVA agent
    team skill for OpenClaw when you give the token; loose Desktop and
    Downloads files sorted into Sorted\<type>; your broken shortcuts to
    quarantine; ~\TIVA\BIBLE.md and desktop launchers.

  Nothing personal is deleted. Files are moved, every move is logged, and
  -Undo moves them back. The Recycle Bin is emptied only with -EmptyRecycleBin.

.EXAMPLE
  .\tiva-bible.ps1 -Preview
  Shows what would be sorted and quarantined. Changes nothing.

.EXAMPLE
  .\tiva-bible.ps1 -Undo
  Moves every sorted file and quarantined shortcut back.

.EXAMPLE
  .\tiva-bible.ps1 -SkipRepair -SkipUpdates
#>
[CmdletBinding()]
param(
  [string]$HqUrl = 'https://saas-admin-template.dhanush-anchan.workers.dev',
  [string]$Root = (Join-Path $HOME 'TIVA'),
  [switch]$SkipInstall,
  [switch]$SkipClean,
  [switch]$SkipRepair,
  [switch]$SkipUpdates,
  [switch]$SkipOrganize,
  [switch]$EmptyRecycleBin,
  [switch]$Preview,
  [switch]$Undo,
  # Internal: the elevated half, started by the normal half.
  [switch]$AdminPhase,
  [string]$ResultFile
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$RepoUrl = 'https://github.com/dhanushanchan-hub/saas-admin-template.git'
$ToolkitBranch = 'claude/busy-carson-qn2gxx'
$SessionUrl = 'https://claude.ai/code/session_01UwndwEJEAF5kCN8H92fXDA'
$Repo = Join-Path $Root 'saas-admin-template'
$Logs = Join-Path $Root 'logs'
$Quarantine = Join-Path $Root 'Quarantine'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$MovesLog = Join-Path $Logs "moves-$Stamp.csv"
$Results = New-Object System.Collections.ArrayList
$script:Note = ''

$Categories = [ordered]@{
  Documents  = '.pdf .doc .docx .txt .rtf .odt .md .xls .xlsx .csv .ppt .pptx .pages .numbers .key .epub'
  Images     = '.jpg .jpeg .png .gif .bmp .webp .heic .heif .svg .tif .tiff .ico .raw'
  Videos     = '.mp4 .mov .avi .mkv .wmv .webm .m4v'
  Audio      = '.mp3 .wav .m4a .aac .flac .ogg .wma'
  Archives   = '.zip .rar .7z .tar .gz .tgz .bz2 .xz .iso'
  Installers = '.exe .msi .msix .msixbundle .appx .appxbundle'
  Code       = '.ps1 .psm1 .py .js .ts .json .html .htm .css .sh .bat .cmd .yml .yaml .xml .sql .ipynb .toml .ini .log .env'
  Design     = '.psd .ai .fig .sketch .xd .indd'
}
# Shortcuts stay where they are; partial downloads are still being written.
$KeepExtensions = @('.lnk', '.url', '.crdownload', '.part', '.partial', '.download', '.opdownload', '.tmp')

# ---------------------------------------------------------------- helpers

function Step([string]$Name, [scriptblock]$Action) {
  Write-Host "`n==> $Name" -ForegroundColor Cyan
  $script:Note = ''
  try {
    & $Action | Out-Host
    [void]$Results.Add([pscustomobject]@{ Step = $Name; Status = 'OK'; Note = $script:Note })
  } catch {
    Write-Warning "$Name failed: $($_.Exception.Message)"
    [void]$Results.Add([pscustomobject]@{ Step = $Name; Status = 'FAILED'; Note = $_.Exception.Message })
  }
}

function Skip([string]$Name, [string]$Why) {
  [void]$Results.Add([pscustomobject]@{ Step = $Name; Status = 'SKIPPED'; Note = $Why })
}

function Has([string]$Command) { [bool](Get-Command $Command -ErrorAction SilentlyContinue) }

# Runs a native program, streams its output, and throws on an exit code outside $OkCodes.
function Exec([string]$File, [string[]]$Arguments, [int[]]$OkCodes = @(0), [switch]$AnyExit) {
  $eap = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'   # native stderr must not become a terminating error in 5.1
  try { & $File @Arguments 2>&1 | ForEach-Object { "$_" } } finally { $ErrorActionPreference = $eap }
  if (-not $AnyExit -and $OkCodes -notcontains $LASTEXITCODE) { throw "$File exited with code $LASTEXITCODE" }
}

# Runs a vendor's official install script in its own PowerShell, so an `exit` inside it can't end this run.
function Install-FromWeb([string]$Command) {
  $prelude = '[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; $ProgressPreference = ''SilentlyContinue''; '
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($prelude + $Command))
  Exec 'powershell.exe' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded)
}

# Installers edit PATH in the registry; pick that up, plus the user bin folders they use.
function Update-Path {
  $extra = @("$HOME\.local\bin", "$HOME\.kimi-code\bin", "$env:APPDATA\npm") | Where-Object { Test-Path -LiteralPath $_ }
  $parts = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) + $extra
  $env:Path = ($parts | Where-Object { $_ }) -join ';'
}

function Format-Size([double]$Bytes) {
  if ([math]::Abs($Bytes) -ge 1GB) { '{0:N1} GB' -f ($Bytes / 1GB) } else { '{0:N0} MB' -f ($Bytes / 1MB) }
}

function Test-Admin {
  ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Deletes files older than $Days under $Path, then the old folders left empty. Files in use are skipped.
function Remove-Old([string]$Path, [int]$Days = 2) {
  if (-not (Test-Path -LiteralPath $Path)) { return 0 }
  $cutoff = (Get-Date).AddDays(-$Days)
  $oldDirs = @(Get-ChildItem -LiteralPath $Path -Recurse -Force -Directory -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff })
  $bytes = 0
  Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    $size = $_.Length
    try { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop; $bytes += $size } catch { }   # in use: leave it
  }
  $oldDirs | Sort-Object { $_.FullName.Length } -Descending | ForEach-Object {
    if (-not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue)) {
      Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue
    }
  }
  $bytes
}

function Get-FreePath([string]$Dir, [string]$Name) {
  $base = [IO.Path]::GetFileNameWithoutExtension($Name)
  $ext = [IO.Path]::GetExtension($Name)
  $path = Join-Path $Dir $Name
  $n = 2
  while (Test-Path -LiteralPath $path) { $path = Join-Path $Dir "$base ($n)$ext"; $n++ }
  $path
}

# Moves a file and records it in the moves log, which -Undo replays backwards.
function Move-Logged([string]$From, [string]$ToDir) {
  $to = Get-FreePath $ToDir (Split-Path -Leaf $From)
  if ($Preview) { Write-Host "  would move  $From  ->  $to"; return }
  New-Item -ItemType Directory -Force -Path $ToDir | Out-Null
  [IO.File]::Move($From, $to)
  [pscustomobject]@{ From = $From; To = $to } | Export-Csv -Path $MovesLog -Append -NoTypeInformation
  Write-Host "  moved  $(Split-Path -Leaf $From)  ->  $ToDir"
}

function Get-Category([string]$Extension) {
  foreach ($name in $Categories.Keys) {
    if (($Categories[$name] -split ' ') -contains $Extension.ToLower()) { return $name }
  }
  'Other'
}

# Sorts the loose files in $Folder into $Folder\Sorted\<type>. Folders, shortcuts,
# hidden files and anything touched in the last 10 minutes stay put.
function Invoke-Organize([string]$Folder) {
  if (-not $Folder -or -not (Test-Path -LiteralPath $Folder)) { return 0 }
  $sorted = Join-Path $Folder 'Sorted'
  $recent = (Get-Date).AddMinutes(-10)
  $hidden = [IO.FileAttributes]::Hidden -bor [IO.FileAttributes]::System
  $count = 0
  Get-ChildItem -LiteralPath $Folder -File -Force -ErrorAction SilentlyContinue | Where-Object {
    -not ($_.Attributes -band $hidden) -and
    ($KeepExtensions -notcontains $_.Extension.ToLower()) -and
    $_.LastWriteTime -lt $recent -and
    $_.FullName -ne $PSCommandPath
  } | ForEach-Object {
    $file = $_
    try { Move-Logged $file.FullName (Join-Path $sorted (Get-Category $file.Extension)); $count++ }
    catch { Write-Warning "  left $($file.Name): $($_.Exception.Message)" }
  }
  $count
}

# Moves shortcuts whose target file is gone to the quarantine folder.
function Invoke-ShortcutSweep([string]$Folder, [string]$Label, [switch]$Recurse) {
  if (-not (Test-Path -LiteralPath $Folder)) { return 0 }
  $shell = New-Object -ComObject WScript.Shell
  $msiCache = Join-Path $env:windir 'Installer'
  $count = 0
  foreach ($lnk in Get-ChildItem -LiteralPath $Folder -Filter *.lnk -File -Force -Recurse:$Recurse -ErrorAction SilentlyContinue) {
    try {
      $target = $shell.CreateShortcut($lnk.FullName).TargetPath
      if (-not $target) { continue }                      # shell folders and Store apps have no file target
      $target = [Environment]::ExpandEnvironmentVariables($target)
      if ($target.StartsWith('\\')) { continue }          # network share: may just be offline
      if ($target.StartsWith($msiCache, [StringComparison]::OrdinalIgnoreCase)) { continue }   # MSI advertised shortcut, works without that file
      $drive = [IO.Path]::GetPathRoot($target)
      if (-not $drive -or -not (Test-Path -LiteralPath $drive)) { continue }   # removable drive not plugged in
      if (Test-Path -LiteralPath $target) { continue }
      Move-Logged $lnk.FullName (Join-Path $Quarantine "Broken shortcuts\$Label")
      $count++
    } catch {
      Write-Warning "  left $($lnk.Name): $($_.Exception.Message)"
    }
  }
  $count
}

function Undo-Moves {
  $logs = @(Get-ChildItem -LiteralPath $Logs -Filter 'moves-*.csv' -File -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
  if (-not $logs) { Write-Host 'Nothing to undo.'; return }
  foreach ($log in $logs) {
    $rows = @(Import-Csv -Path $log.FullName)
    [array]::Reverse($rows)
    $failed = 0
    foreach ($row in $rows) {
      if (-not (Test-Path -LiteralPath $row.To) -or (Test-Path -LiteralPath $row.From)) { continue }
      try {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $row.From) | Out-Null
        [IO.File]::Move($row.To, $row.From)
        Write-Host "  restored  $($row.From)"
      } catch {
        $failed++
        Write-Warning "  could not restore $($row.From): $($_.Exception.Message)"
      }
    }
    if ($failed) { Write-Warning "$($log.Name): $failed item(s) left. Public desktop and All Users Start menu items need an admin window." }
    else { Rename-Item -LiteralPath $log.FullName -NewName ($log.Name + '.undone') }
  }
}

function New-Shortcut([string]$Name, [string]$Target, [string]$Arguments = '', [string]$WorkDir = '') {
  $desktop = [Environment]::GetFolderPath('Desktop')
  $lnk = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop "$Name.lnk"))
  $lnk.TargetPath = $Target
  $lnk.Arguments = $Arguments
  if ($WorkDir) { $lnk.WorkingDirectory = $WorkDir }
  $lnk.Save()
}

function Get-DownloadsFolder {
  try { (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path } catch { Join-Path $HOME 'Downloads' }
}

# Writes JSON without a BOM: Node-based agents fail to parse a BOM.
function Write-JsonFile([string]$Path, $Value) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 10), (New-Object Text.UTF8Encoding $false))
}

# ---------------------------------------------------------------- admin half

function Invoke-AdminPhase {
  Step 'Restore point' {
    Checkpoint-Computer -Description 'TIVA Bible' -RestorePointType MODIFY_SETTINGS
    $script:Note = 'requested (Windows makes at most one a day)'
  }

  if ($SkipInstall) { Skip 'Git, GitHub CLI, Node.js' '-SkipInstall' } else {
    Step 'Git, GitHub CLI, Node.js' {
      if (-not (Has winget)) { throw 'winget is missing. Install "App Installer" from the Microsoft Store, then run again.' }
      $need = @()
      if (-not (Has git)) { $need += 'Git.Git' }
      if (-not (Has gh)) { $need += 'GitHub.cli' }
      $nodeMajor = 0
      if (Has node) { $nodeMajor = [int]((node --version) -replace '^v(\d+).*', '$1') }
      if ($nodeMajor -lt 22) { $need += 'OpenJS.NodeJS.LTS' }
      $failed = @()
      foreach ($id in $need) {
        try { Exec 'winget' @('install', '--id', $id, '--exact', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') }
        catch { $failed += $id }
      }
      if ($failed) { throw "winget could not install $($failed -join ', ')" }
      $script:Note = if ($need) { 'installed ' + ($need -join ', ') } else { 'already installed' }
    }
  }

  if ($SkipClean) { Skip 'System junk' '-SkipClean' } else {
    Step 'System junk' {
      $before = (Get-PSDrive -Name $env:SystemDrive.TrimEnd(':')).Free
      [void](Remove-Old "$env:windir\Temp")
      [void](Remove-Old "$env:ProgramData\Microsoft\Windows\WER\ReportArchive" 0)
      [void](Remove-Old "$env:ProgramData\Microsoft\Windows\WER\ReportQueue" 0)
      [void](Remove-Old "$env:windir\Minidump" 0)
      Remove-Item -LiteralPath "$env:windir\MEMORY.DMP" -Force -ErrorAction SilentlyContinue
      if (Has Delete-DeliveryOptimizationCache) { Delete-DeliveryOptimizationCache -Force -ErrorAction SilentlyContinue }
      if (Has Clear-DnsClientCache) { Clear-DnsClientCache }
      Exec 'dism.exe' @('/Online', '/Cleanup-Image', '/StartComponentCleanup') -OkCodes 0, 3010
      $after = (Get-PSDrive -Name $env:SystemDrive.TrimEnd(':')).Free
      $script:Note = "freed $(Format-Size ($after - $before))"
    }
  }

  if ($SkipOrganize) { Skip 'Broken shortcuts, all users' '-SkipOrganize' } else {
    Step 'Broken shortcuts, all users' {
      $n = (Invoke-ShortcutSweep "$env:PUBLIC\Desktop" 'Public Desktop') +
           (Invoke-ShortcutSweep "$env:ProgramData\Microsoft\Windows\Start Menu\Programs" 'All Users Start menu' -Recurse)
      $script:Note = "$n moved to $Quarantine"
    }
  }

  if ($SkipRepair) { Skip 'Repair' '-SkipRepair' } else {
    Step 'Windows image repair (DISM)' {
      Exec 'dism.exe' @('/Online', '/Cleanup-Image', '/RestoreHealth') -OkCodes 0, 3010
      $script:Note = if ($LASTEXITCODE -eq 3010) { 'repaired; restart needed' } else { 'healthy' }
    }
    Step 'System file check (SFC)' {
      $encoding = [Console]::OutputEncoding
      [Console]::OutputEncoding = [Text.Encoding]::Unicode   # sfc writes UTF-16
      try { Exec 'sfc.exe' @('/scannow') -AnyExit } finally { [Console]::OutputEncoding = $encoding }
      $script:Note = "exit code $LASTEXITCODE; details in $env:windir\Logs\CBS\CBS.log"
    }
    Step 'Disk scan (read-only)' {
      Exec 'chkdsk.exe' @($env:SystemDrive, '/scan') -AnyExit
      $script:Note = switch ($LASTEXITCODE) { 0 { 'no errors' } default { "exit code ${LASTEXITCODE}: see the output above; a reboot with chkdsk /spotfix may be needed" } }
    }
    Step 'Defender quick scan' {
      if (-not (Has Start-MpScan)) { throw 'Microsoft Defender is not available (another antivirus may be active)' }
      $start = Get-Date
      Update-MpSignature
      Start-MpScan -ScanType QuickScan
      $found = @(Get-MpThreatDetection -ErrorAction SilentlyContinue | Where-Object { $_.InitialDetectionTime -gt $start }).Count
      $script:Note = "$found threat(s) found"
    }
  }

  if ($SkipUpdates) { Skip 'App updates' '-SkipUpdates' } else {
    Step 'App updates (winget upgrade --all)' {
      if (-not (Has winget)) { throw 'winget is missing' }
      # Windows Terminal may be hosting this run; upgrading it would close the window mid-run.
      Exec 'winget' @('pin', 'add', '--id', 'Microsoft.WindowsTerminal', '--exact', '--accept-source-agreements') -AnyExit
      $pinned = $LASTEXITCODE -eq 0
      try {
        Exec 'winget' @('upgrade', '--all', '--silent', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity') -AnyExit
        $code = $LASTEXITCODE
      } finally {
        if ($pinned) { Exec 'winget' @('pin', 'remove', '--id', 'Microsoft.WindowsTerminal', '--exact') -AnyExit }
      }
      $script:Note = "winget exit code $code"
    }
  }
}

# ---------------------------------------------------------------- your half

function Invoke-UserPhase([string]$HqToken) {
  Update-Path

  if ($SkipClean) { Skip 'Your junk' '-SkipClean' } else {
    Step 'Your junk' {
      $freed = (Remove-Old $env:TEMP) + (Remove-Old "$env:LOCALAPPDATA\CrashDumps" 0)
      if ($EmptyRecycleBin) { Clear-RecycleBin -Force -ErrorAction SilentlyContinue }
      $script:Note = "freed $(Format-Size $freed)" + $(if ($EmptyRecycleBin) { ', Recycle Bin emptied' } else { '' })
    }
  }

  if ($SkipInstall) { Skip 'AI agents and TIVA repo' '-SkipInstall' } else {
    Step 'uv (Python tool manager)' {
      if (Has uv) { $script:Note = 'already installed'; return }
      Install-FromWeb 'irm https://astral.sh/uv/install.ps1 | iex'
      Update-Path
      $script:Note = 'installed'
    }
    Step 'Claude Code' {
      if (-not (Has claude)) { Install-FromWeb 'irm https://claude.ai/install.ps1 | iex'; Update-Path }
      $script:Note = (& claude --version) -join ' '
    }
    Step 'Kimi Code' {
      if (Test-Path -LiteralPath "$HOME\.kimi-code\bin") { $script:Note = 'already installed'; return }
      Install-FromWeb 'irm https://code.kimi.com/kimi-code/install.ps1 | iex'
      Update-Path
      $script:Note = 'installed'
    }
    Step 'OpenClaw' {
      if (-not (Has openclaw)) {
        # -NoOnboard: the onboarding wizard is interactive; it runs at the end, by hand.
        Install-FromWeb '& ([scriptblock]::Create((irm https://openclaw.ai/install.ps1))) -NoOnboard'
        Update-Path
      }
      $script:Note = (& openclaw --version) -join ' '
    }
    Step 'TIVA repo' {
      if (Test-Path -LiteralPath (Join-Path $Repo '.git')) { Exec 'git' @('-C', $Repo, 'pull', '--ff-only') }
      else { Exec 'git' @('clone', $RepoUrl, $Repo) }
      # Until the toolkit PR is merged, main doesn't have it yet.
      if (-not (Test-Path -LiteralPath (Join-Path $Repo '.claude\toolkit\sources.json'))) {
        Exec 'git' @('-C', $Repo, 'checkout', $ToolkitBranch) -AnyExit
      }
      $script:Note = "$Repo on $((& git -C $Repo branch --show-current))"
    }
    Step 'SkillSpector' {
      if (Has skillspector) { $script:Note = 'already installed'; return }
      $source = (Get-Content -LiteralPath (Join-Path $Repo '.claude\toolkit\sources.json') -Raw | ConvertFrom-Json).skillspector
      Exec 'uv' @('tool', 'install', '--python', '3.12', "git+$($source.repo)@$($source.ref)")
      Update-Path
      $script:Note = (& skillspector --version) -join ' '
    }
    Step 'Share skills with Kimi Code and OpenClaw' {
      # Both read %USERPROFILE%\.agents\skills. Reticle stays repo-only: it needs its MCP server.
      $target = Join-Path $HOME '.agents\skills'
      New-Item -ItemType Directory -Force -Path $target | Out-Null
      $skills = @(Get-ChildItem -LiteralPath (Join-Path $Repo '.claude\skills') -Directory | Where-Object { $_.Name -ne 'reticle' })
      foreach ($skill in $skills) {
        $dest = Join-Path $target $skill.Name
        if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
        Copy-Item -LiteralPath $skill.FullName -Destination $dest -Recurse
      }
      $script:Note = "$($skills.Count) skills in $target"
    }
    Step 'Connect Claude Code and Kimi Code to OpenClaw (MCP)' {
      # `claude mcp get` would try to connect, which fails until OpenClaw is onboarded, so check the config file instead.
      Exec 'claude' @('mcp', 'add', '--scope', 'user', 'openclaw', '--', 'openclaw', 'mcp', 'serve') -AnyExit
      $claudeConfig = Join-Path $HOME '.claude.json'
      if (-not ((Test-Path -LiteralPath $claudeConfig) -and (Select-String -LiteralPath $claudeConfig -Pattern '"openclaw"\s*:' -Quiet))) {
        throw 'Claude Code did not record the server. Run: claude mcp add --scope user openclaw -- openclaw mcp serve'
      }
      $kimiConfig = Join-Path $HOME '.kimi-code\mcp.json'
      $raw = $null
      if (Test-Path -LiteralPath $kimiConfig) { $raw = Get-Content -LiteralPath $kimiConfig -Raw }
      $config = if ($raw -and $raw.Trim()) { $raw | ConvertFrom-Json } else { New-Object PSObject }
      if (-not $config.PSObject.Properties['mcpServers']) { $config | Add-Member -NotePropertyName mcpServers -NotePropertyValue (New-Object PSObject) }
      $config.mcpServers | Add-Member -NotePropertyName openclaw -NotePropertyValue ([pscustomobject]@{ command = 'openclaw'; args = @('mcp', 'serve') }) -Force
      Write-JsonFile $kimiConfig $config
      $script:Note = 'works once OpenClaw is onboarded (its gateway must be running)'
    }
    if ($HqToken) {
      Step 'TIVA agent team skill for OpenClaw' {
        & (Join-Path $Repo 'integrations\openclaw-windows\setup-openclaw.ps1') -HqUrl $HqUrl -HqToken $HqToken -SkipOpenClawInstall
        $script:Note = "connected to $HqUrl"
      }
    } else {
      Skip 'TIVA agent team skill for OpenClaw' 'no token given; see BIBLE.md section 2'
    }
  }

  if ($SkipOrganize) { Skip 'Organize' '-SkipOrganize' } else {
    Step 'Sort Desktop and Downloads' {
      $desktop = [Environment]::GetFolderPath('Desktop')
      $downloads = Get-DownloadsFolder
      $d = Invoke-Organize $desktop
      $w = Invoke-Organize $downloads
      $script:Note = "$d from Desktop, $w from Downloads, into each folder's Sorted\<type>"
    }
    Step 'Broken shortcuts, yours' {
      $n = (Invoke-ShortcutSweep ([Environment]::GetFolderPath('Desktop')) 'Desktop') +
           (Invoke-ShortcutSweep "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" 'Start menu' -Recurse)
      $script:Note = "$n moved to $Quarantine"
    }
  }

  Step 'TIVA Bible and launchers' {
    $bible = $BibleText
    $values = @{ '{{ROOT}}' = $Root; '{{REPO}}' = $Repo; '{{HQURL}}' = $HqUrl; '{{SESSION}}' = $SessionUrl; '{{DATE}}' = (Get-Date -Format 'yyyy-MM-dd HH:mm') }
    foreach ($key in $values.Keys) { $bible = $bible.Replace($key, $values[$key]) }
    $biblePath = Join-Path $Root 'BIBLE.md'
    Set-Content -LiteralPath $biblePath -Value $bible -Encoding UTF8
    New-Shortcut 'TIVA Workspace' $Root
    New-Shortcut 'TIVA Bible' "$env:windir\System32\notepad.exe" "`"$biblePath`""
    $made = @('TIVA Workspace', 'TIVA Bible')
    foreach ($agent in @(@('Claude Code (TIVA)', 'claude', ''), @('Kimi Code (TIVA)', 'kimi', ''), @('OpenClaw Dashboard', 'openclaw', 'dashboard'))) {
      $exe = Get-Command $agent[1] -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($exe) { New-Shortcut $agent[0] $exe.Source $agent[2] $Repo; $made += $agent[0] }
    }
    $script:Note = 'Desktop: ' + ($made -join ', ')
  }
}

# ---------------------------------------------------------------- the book

$BibleText = @'
# TIVA Bible

Everything set up for the Founder so far, on one page. Written by tiva-bible.ps1 on {{DATE}}.
The full chat where it was built: {{SESSION}}

## 1. What is on this PC

| What | Where | Start it |
| --- | --- | --- |
| TIVA workspace | {{ROOT}} | Desktop: TIVA Workspace |
| TIVA repo (TIVA HQ code and the Claude Code toolkit) | {{REPO}} | |
| Claude Code (Anthropic) | `claude` | Desktop: Claude Code (TIVA) |
| Kimi Code (Moonshot AI) | `kimi` | Desktop: Kimi Code (TIVA) |
| OpenClaw | `openclaw` | Desktop: OpenClaw Dashboard |
| SkillSpector (NVIDIA skill scanner) | `skillspector` | `skillspector scan <folder or GitHub link> --no-llm` |
| Git, GitHub CLI, Node.js, uv | `git`, `gh`, `node`, `uv` | |
| Logs of every run, moves log for undo | {{ROOT}}\logs | |
| Broken shortcuts that were moved aside | {{ROOT}}\Quarantine | |
| Sorted Desktop and Downloads files | Desktop\Sorted, Downloads\Sorted | |

## 2. One-time sign-ins

1. Claude Code: open "Claude Code (TIVA)" and sign in with your Claude account.
2. Kimi Code: open "Kimi Code (TIVA)", type `/login`, choose Kimi Code OAuth or a Moonshot API key.
3. OpenClaw: in a normal PowerShell window run `openclaw onboard --install-daemon` and pick your AI access. Then open "OpenClaw Dashboard".
4. GitHub, to push code from this PC: `gh auth login`.
5. TIVA HQ token, if you skipped it during the run:

       powershell -ExecutionPolicy Bypass -File "{{REPO}}\integrations\openclaw-windows\setup-openclaw.ps1" -HqUrl {{HQURL}} -HqToken (Read-Host "TIVA HQ API token") -SkipOpenClawInstall

## 3. How the agents fit together

- TIVA HQ ({{HQURL}}) is the brain: Hermes, the executive team, briefs, decisions and memory. Command Center: {{HQURL}}/admin/command
- OpenClaw is the hands on this desktop. Its tiva-agent-team skill sends your directives to TIVA HQ and reads back the briefs.
- Claude Code and Kimi Code are the coding agents. Both reach OpenClaw over MCP (`openclaw mcp serve`) once OpenClaw is onboarded.
- Skills: Claude Code reads the repo's `.claude\skills`. Kimi Code and OpenClaw read `%USERPROFILE%\.agents\skills`, where this run copied the same skills.
- Project rules for every agent: `AGENTS.md` in the repo. Claude Code reads it through `CLAUDE.md`.
- Cloud sessions (Claude app, claude.ai/code) get the same toolkit from the repo on GitHub.

## 4. The Claude Code toolkit

| Tool | What it does | Use it |
| --- | --- | --- |
| SkillSpector (NVIDIA) | Security scan for agent skills before you trust them | "Is this skill safe? <link>" |
| Reticle | Checks the running app from the inside and names the file and line to fix | "Verify the login page works", or /reticle |
| Chisle | Short answers, least code, trimmed tool output | On by default. "stop chisle" or "normal mode" turns it off, /chisle turns it on |
| UI Skills | Spacing, typography, accessibility, motion and metadata rules | /baseline-ui, /improve-ui, /fixing-accessibility |
| Anti-Slop | Keeps the generic AI look out of UI, copy and code comments | Applied while building. Ask for an "antislop audit" for a findings list |

- Every skill and hook was scanned with SkillSpector before it was added. Reviewed findings and their reasons: `.claude\toolkit\skillspector-baseline.yaml`. A GitHub check scans every change to them.
- Update all five: in the repo run `node .claude\toolkit\sync.mjs --latest`, then rescan (docs\CLAUDE_CODE_TOOLKIT.md).
- Reticle adds a dev-only SDK to the app and starts the dev server the first time it verifies a change, without asking. Review that change before merging it.

## 5. GitHub, web search and connectors

- GitHub: cloud sessions work through the Claude GitHub App as dhanushanchan-hub. More repos: https://claude.ai/connect-github
- Web search works in Claude Code. In cloud sessions, the environment's network setting decides which sites Claude can open: session title bar, environment menu, Edit, Network access.
- Connectors to sign in to on claude.ai before Claude can use them: Base44, CData Connect AI, Windsor.ai.
- Already connected to your Claude: GitHub, Gmail, Google Drive, Notion, ClickUp, Canva, Figma, Gamma, Vercel, Cloudflare, Excalidraw, Mermaid Chart, Manufact, Apollo GraphOS.

## 6. Apps and platforms that connect over MCP

| Platform | How it connects |
| --- | --- |
| CrewAI | `mcps=[...]` on an agent, or `MCPServerAdapter` (`pip install "crewai-tools[mcp]"`) |
| Ruflo (formerly Claude Flow) | MCP server for Claude Code and Codex: `claude mcp add claude-flow -- npx ruflo@latest mcp start` |
| OpenClaw | Uses MCP servers, and `openclaw mcp serve` makes it one |
| Hermes Agent (Nous Research) | `hermes mcp add <name> --url ...`; `hermes import-agent claude-code` copies your Claude MCP setup |
| ChatGPT | Settings, Apps and Connectors, Developer mode. Public HTTPS servers only, paid plans |

- AI assistants: Claude, ChatGPT, Gemini (Gemini Spark), Microsoft 365 Copilot, Copilot Studio, Mistral Le Chat, Perplexity, Grok (API).
- Coding agents and editors: Claude Code, Kimi Code, OpenAI Codex, Cursor, GitHub Copilot, VS Code, Visual Studio, JetBrains AI Assistant and Junie, Devin Desktop (formerly Windsurf), Google Antigravity, Kiro, Zed, Cline, Roo Code, Kilo Code, Continue, OpenCode, Amp, Augment Code, Warp, Goose.
- Agent frameworks: CrewAI, LangChain and LangGraph, LlamaIndex, OpenAI Agents SDK, Claude Agent SDK, Google ADK, Microsoft Agent Framework, AWS Strands and Bedrock AgentCore, Pydantic AI, Mastra, Vercel AI SDK, smolagents, Agno, Spring AI, Genkit.
- Automation: n8n, Zapier MCP, Make, Pipedream, Activepieces, Dify, Langflow, Flowise.
- Chat apps on your PC: LM Studio, Open WebUI, LibreChat, Msty, Jan, Cherry Studio, AnythingLLM, Raycast.
- The full directory, about 600 clients: https://www.pulsemcp.com/clients

## 7. PC care

Each run of tiva-bible.ps1:
- Makes a restore point, then deletes temp files older than 2 days, Windows error reports, crash dumps, and the Delivery Optimization and DNS caches.
- Repairs Windows (DISM RestoreHealth, SFC), scans the disk read-only, updates Defender and runs a quick scan, and updates your apps with winget.
- Sorts loose Desktop and Downloads files into Sorted\<type> and moves broken shortcuts to {{ROOT}}\Quarantine. It never deletes your files.

Useful commands (the script keeps a copy in {{ROOT}}):

    powershell -ExecutionPolicy Bypass -File "{{ROOT}}\tiva-bible.ps1" -Preview      # show what would move, change nothing
    powershell -ExecutionPolicy Bypass -File "{{ROOT}}\tiva-bible.ps1" -Undo         # put sorted files and shortcuts back
    powershell -ExecutionPolicy Bypass -File "{{ROOT}}\tiva-bible.ps1"               # run again, monthly is plenty

Options: -SkipInstall, -SkipClean, -SkipRepair, -SkipUpdates, -SkipOrganize, -EmptyRecycleBin.
Restart the PC after a run that repaired files or updated apps.

## 8. Next steps

- Merge the toolkit pull request, if it isn't merged yet: https://github.com/dhanushanchan-hub/saas-admin-template/pull/5
- Turn TIVA HQ into an MCP server so ChatGPT, Claude, Gemini, Copilot, CrewAI, Hermes Agent, OpenClaw and Ruflo can all reach the agent team. Ask Claude: "build the TIVA HQ MCP server".
- Keep this PC safe: no RDP or WinRM open to the internet, run OpenClaw as a normal user, and keep TIVA_HQ_TOKEN out of scripts and chats.
'@

# ---------------------------------------------------------------- run

New-Item -ItemType Directory -Force -Path $Root, $Logs | Out-Null
$transcript = Join-Path $Logs ("{0}-{1}.log" -f $(if ($AdminPhase) { 'admin' } else { 'run' }), $Stamp)
try { Start-Transcript -Path $transcript | Out-Null } catch { }   # a host without transcripts still runs

try {
  if ($AdminPhase) {
    Invoke-AdminPhase
    if ($ResultFile) { Write-JsonFile $ResultFile @($Results) }
    return
  }

  if ($Undo) { Undo-Moves; return }

  Write-Host "`nTIVA Bible: set up the AI agents, then clean, repair and organize this PC." -ForegroundColor Green
  Write-Host "Workspace $Root. Log $transcript"

  if ($PSCommandPath) {
    $copy = Join-Path $Root 'tiva-bible.ps1'
    if ($PSCommandPath -ne $copy) { Copy-Item -LiteralPath $PSCommandPath -Destination $copy -Force }
  }

  if ($Preview) {
    Write-Host "`nPreview: nothing is changed.`n"
    [void](Invoke-Organize ([Environment]::GetFolderPath('Desktop')))
    [void](Invoke-Organize (Get-DownloadsFolder))
    [void](Invoke-ShortcutSweep ([Environment]::GetFolderPath('Desktop')) 'Desktop')
    [void](Invoke-ShortcutSweep "$env:PUBLIC\Desktop" 'Public Desktop')
    [void](Invoke-ShortcutSweep "$env:APPDATA\Microsoft\Windows\Start Menu\Programs" 'Start menu' -Recurse)
    [void](Invoke-ShortcutSweep "$env:ProgramData\Microsoft\Windows\Start Menu\Programs" 'All Users Start menu' -Recurse)
    return
  }

  $token = $env:TIVA_HQ_TOKEN
  if (-not $SkipInstall -and -not $token) {
    $secure = Read-Host "`nTIVA HQ API token, for OpenClaw's agent team skill (Enter skips)" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  }

  # npm's PowerShell shims (OpenClaw's installer uses them) are blocked under the default Restricted policy.
  if (@('Undefined', 'Restricted', 'AllSigned') -contains (Get-ExecutionPolicy -Scope CurrentUser)) {
    try { Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force } catch { Write-Warning $_.Exception.Message }
  }

  if (Test-Admin) {
    Write-Warning 'This window runs as administrator, so the agents get installed as admin too. A normal window is better for OpenClaw.'
    Invoke-AdminPhase
  } else {
    Write-Host "`nWindows will ask once for admin rights. The admin part runs in a second window; leave both open." -ForegroundColor Yellow
    $resultPath = Join-Path $Logs "admin-$Stamp.json"
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$(Join-Path $Root 'tiva-bible.ps1')`"",
      '-AdminPhase', '-Root', "`"$Root`"", '-ResultFile', "`"$resultPath`"")
    foreach ($name in 'SkipInstall', 'SkipClean', 'SkipRepair', 'SkipUpdates', 'SkipOrganize') {
      if ((Get-Variable -Name $name -ValueOnly).IsPresent) { $argList += "-$name" }
    }
    try {
      Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList $argList
      if (Test-Path -LiteralPath $resultPath) {
        foreach ($row in (Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json)) { [void]$Results.Add($row) }
      } else {
        Skip 'Admin part' "it ended early; see $Logs\admin-*.log"
      }
    } catch {
      Skip 'Admin part' 'admin approval was declined'
    }
  }

  Invoke-UserPhase $token

  Write-Host "`n==================== Delivered ====================" -ForegroundColor Green
  $Results | Format-Table -AutoSize -Wrap | Out-Host
  $Results | Format-Table -AutoSize -Wrap | Out-String -Width 200 | Set-Content -LiteralPath (Join-Path $Root 'last-run.txt') -Encoding UTF8
  Write-Host @"
Next, once:
  1. Desktop > Claude Code (TIVA): sign in.
  2. Desktop > Kimi Code (TIVA): type /login.
  3. PowerShell (normal window): openclaw onboard --install-daemon
  4. Optional: gh auth login
Everything else, including undo: $Root\BIBLE.md
Restart the PC to finish repairs and updates.
"@
} finally {
  try { Stop-Transcript | Out-Null } catch { }
}
