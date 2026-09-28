@echo off
title TIVA Master
set "TIVA_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f=[IO.File]::ReadAllText($env:TIVA_SELF); $m=[char]35+'TIVA-PS-START'; Invoke-Expression $f.Substring($f.IndexOf($m)+$m.Length)"
exit /b
#TIVA-PS-START
# TIVA Master: one file for the founder's PC. Double-click it and choose from the menu.
# It never deletes or moves your files: "organise" makes copies, originals stay where they are.

$ErrorActionPreference = 'Continue'
$TivaHome = Join-Path $env:USERPROFILE 'TIVA'
$AllFiles = Join-Path $TivaHome 'All Files'
$HqUrl = 'https://saas-admin-template.dhanush-anchan.workers.dev/login'
$Workstation = 'tiva-founder-desktop'

function Get-DesktopFolder { [Environment]::GetFolderPath('Desktop') }

function Get-DownloadsFolder {
    try {
        $path = (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path
        if ($path -and (Test-Path $path)) { return $path }
    } catch { }
    return (Join-Path $env:USERPROFILE 'Downloads')
}

function Pause-Menu { Write-Host ''; Read-Host '  Press Enter to go back to the menu' | Out-Null }

function Say($text, $color = 'Gray') { Write-Host "  $text" -ForegroundColor $color }

# Newest copy of a file you downloaded from the chat (browsers add " (1)", " (2)" to repeats).
function Find-Newest($pattern) {
    $places = @((Get-DownloadsFolder), (Get-DesktopFolder), $AllFiles) | Where-Object { $_ -and (Test-Path $_) }
    Get-ChildItem -Path $places -Filter $pattern -File -Recurse -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

# ------------------------------------------------------------------ 1. organise
function Get-Category($file) {
    $name = $file.Name.ToLower()
    if ($name -match '^(paste-|tiva-|founder-|fix-azure)') { return 'TIVA setup files' }
    switch ($file.Extension.ToLower().TrimStart('.')) {
        { $_ -in 'pdf', 'doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'pages' } { return 'Documents' }
        { $_ -in 'xls', 'xlsx', 'xlsm', 'csv', 'ods', 'numbers' } { return 'Spreadsheets' }
        { $_ -in 'ppt', 'pptx', 'odp', 'key' } { return 'Presentations' }
        { $_ -in 'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff', 'svg', 'cr2', 'nef' } { return 'Photos and images' }
        { $_ -in 'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp', 'wmv' } { return 'Videos' }
        { $_ -in 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'amr' } { return 'Audio' }
        { $_ -in 'zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz' } { return 'Archives' }
        { $_ -in 'exe', 'msi', 'msix', 'appx', 'apk', 'dmg', 'iso' } { return 'Installers' }
        { $_ -in 'ps1', 'sh', 'py', 'js', 'ts', 'json', 'yml', 'yaml', 'bat', 'cmd', 'html', 'css', 'sql', 'xml', 'rdp' } { return 'Code and scripts' }
    }
    return 'Other'
}

function Invoke-Organise {
    $sources = @((Get-DownloadsFolder), (Get-DesktopFolder)) | Where-Object { Test-Path $_ } | Select-Object -Unique
    Say 'Reading every file in:' Yellow
    $sources | ForEach-Object { Say "  $_" }
    $skip = '\.(lnk|url|ini|tmp|crdownload|part|partial)$'
    $files = @(Get-ChildItem -Path $sources -File -Recurse -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notmatch $skip -and $_.Name -notlike '~$*' -and $_.Name -ne 'Thumbs.db' -and $_.FullName -notlike "$TivaHome*" })
    if ($files.Count -eq 0) { Say 'No files found.'; return }

    # Same size first, then the file's fingerprint, to find exact duplicates.
    Say "Found $($files.Count) files. Looking for exact duplicates..."
    $fingerprint = @{}
    foreach ($group in ($files | Group-Object Length | Where-Object Count -gt 1)) {
        foreach ($f in $group.Group) {
            try { $fingerprint[$f.FullName] = (Get-FileHash -LiteralPath $f.FullName -Algorithm SHA256 -ErrorAction Stop).Hash } catch { }
        }
    }
    $seen = @{}
    $unique = New-Object System.Collections.Generic.List[object]
    $dupes = @{}
    foreach ($f in ($files | Sort-Object LastWriteTime -Descending)) {
        $key = $fingerprint[$f.FullName]
        if ($key -and $seen.ContainsKey($key)) { $dupes[$f.FullName] = $seen[$key]; continue }
        if ($key) { $seen[$key] = $f.FullName }
        $unique.Add($f)
    }

    $needGB = [math]::Round((($unique | Measure-Object Length -Sum).Sum) / 1GB, 2)
    $drive = Get-PSDrive -Name ($env:USERPROFILE.Substring(0, 1))
    $freeGB = [math]::Round($drive.Free / 1GB, 2)
    Say "$($unique.Count) different files ($needGB GB), $($dupes.Count) exact duplicates. Free space: $freeGB GB."
    if ($needGB -gt ($freeGB - 2)) {
        Say 'Not enough free space to copy them all. Nothing was copied.' Red
        Say 'Free some space (or tell Claude) and run this again.' Red
        return
    }
    if ((Read-Host "  Copy them into '$AllFiles', sorted into folders? Originals stay where they are. [Y/n]") -match '^[nN]') { return }

    New-Item -ItemType Directory -Force -Path $AllFiles | Out-Null
    $index = New-Object System.Collections.Generic.List[object]
    $done = 0; $failed = 0; $i = 0
    foreach ($f in $unique) {
        $i++
        Write-Progress -Activity 'Copying into TIVA All Files' -Status $f.Name -PercentComplete ([int](100 * $i / $unique.Count))
        $category = Get-Category $f
        $folder = Join-Path $AllFiles $category
        New-Item -ItemType Directory -Force -Path $folder | Out-Null
        $target = Join-Path $folder $f.Name
        $n = 2
        while (Test-Path -LiteralPath $target) {
            if ((Get-Item -LiteralPath $target).Length -eq $f.Length -and
                (Get-Item -LiteralPath $target).LastWriteTime -eq $f.LastWriteTime) { break }  # copied on an earlier run
            $target = Join-Path $folder ("{0} ({1}){2}" -f $f.BaseName, $n, $f.Extension); $n++
        }
        try {
            if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $f.FullName -Destination $target -ErrorAction Stop }
            $done++
            $index.Add([pscustomobject]@{ Category = $category; Name = $f.Name; SavedAs = $target; From = $f.FullName
                                          SizeMB = [math]::Round($f.Length / 1MB, 2); Modified = $f.LastWriteTime; DuplicateOf = '' })
        } catch { $failed++ }
    }
    Write-Progress -Activity 'Copying into TIVA All Files' -Completed
    foreach ($d in $dupes.Keys) {
        $item = Get-Item -LiteralPath $d -ErrorAction SilentlyContinue
        $index.Add([pscustomobject]@{ Category = 'Duplicate (not copied)'; Name = (Split-Path $d -Leaf); SavedAs = ''; From = $d
                                      SizeMB = if ($item) { [math]::Round($item.Length / 1MB, 2) } else { '' }
                                      Modified = if ($item) { $item.LastWriteTime } else { '' }; DuplicateOf = $dupes[$d] })
    }
    $index | Export-Csv -Path (Join-Path $AllFiles 'index.csv') -NoTypeInformation -Encoding UTF8

    Write-Host ''
    Say "Done: $done files copied, $($dupes.Count) duplicates skipped, $failed could not be copied (open or locked)." Green
    $index | Where-Object { $_.SavedAs } | Group-Object Category | Sort-Object Count -Descending |
        ForEach-Object { Say ("{0,6}  {1}" -f $_.Count, $_.Name) }
    Say "A full list (what, from where, saved where) is in: $(Join-Path $AllFiles 'index.csv')"
    Start-Process explorer.exe $AllFiles
}

# ------------------------------------------------------------------ 2. this PC
function Invoke-SetupPc {
    $rdp = @(
        "full address:s:$Workstation", 'username:s:tivafounder', 'screen mode id:i:2', 'use multimon:i:0',
        'dynamic resolution:i:1', 'smart sizing:i:1', 'session bpp:i:32', 'connection type:i:7',
        'networkautodetect:i:1', 'bandwidthautodetect:i:1', 'autoreconnection enabled:i:1', 'audiomode:i:0',
        'audiocapturemode:i:1', 'videoplaybackmode:i:1', 'camerastoredirect:s:*', 'redirectclipboard:i:1',
        'redirectprinters:i:1', 'drivestoredirect:s:*', 'allow font smoothing:i:1', 'allow desktop composition:i:1',
        'disable wallpaper:i:0', 'disable full window drag:i:0', 'disable menu anims:i:0', 'disable themes:i:0',
        'bitmapcachepersistenable:i:1', 'authentication level:i:2', 'enablecredsspsupport:i:1'
    ) -join "`r`n"
    Set-Content -Path (Join-Path (Get-DesktopFolder) 'TIVA Workstation.rdp') -Value $rdp -Encoding Unicode
    Say 'Added "TIVA Workstation" to your desktop.' Green
    if (Get-TailscaleExe) {
        Say 'Tailscale is already installed.' Green
    } elseif (Get-Command winget -ErrorAction SilentlyContinue) {
        Say 'Installing Tailscale (click Yes if Windows asks)...'
        winget install --id Tailscale.Tailscale --exact --silent --accept-package-agreements --accept-source-agreements
    } else {
        Say 'Opening the Tailscale download page: install it, then come back.' Yellow
        Start-Process 'https://tailscale.com/download/windows'
    }
    Say 'Next: click the Tailscale icon near the clock and sign in with the SAME account'
    Say 'you use for the Azure workstation.'
}

function Get-TailscaleExe {
    @("$env:ProgramFiles\Tailscale\tailscale.exe", "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe") |
        Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
}

# ------------------------------------------------------------------ 3 and 4. pastes
function Invoke-Paste($pattern, $what, [string[]]$steps, $openUrl) {
    $file = Find-Newest $pattern
    if (-not $file) {
        Say "I can't find $pattern in your Downloads or Desktop." Red
        Say 'Download it again from the Claude chat, then choose this option again.' Red
        return
    }
    Set-Clipboard -Value ([IO.File]::ReadAllText($file.FullName))
    Say "Copied $what to your clipboard" Green
    Say "(from $($file.Name), saved $($file.LastWriteTime.ToString('dd-MM-yyyy HH:mm')))."
    Write-Host ''
    $n = 1
    foreach ($s in $steps) { Say "$n. $s" Yellow; $n++ }
    if ($openUrl) { Start-Process $openUrl }
}

# ------------------------------------------------------------------ 5. check
function Test-Port($hostName, $port) {
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $ok = $client.ConnectAsync($hostName, $port).Wait(4000)
        $client.Close()
        return $ok
    } catch { return $false }
}

function Show-Check($ok, $text, $fix) {
    if ($ok) { Say "[DONE]     $text" Green } else { Say "[NOT YET]  $text" Red; if ($fix) { Say "           -> $fix" DarkGray } }
}

function Invoke-Check {
    Say 'Checking...' Yellow
    $index = Join-Path $AllFiles 'index.csv'
    $count = if (Test-Path $index) { @(Import-Csv $index | Where-Object { $_.SavedAs }).Count } else { 0 }
    Show-Check ($count -gt 0) "Files gathered into TIVA All Files ($count files)" 'Menu option 1'
    Show-Check (Test-Path (Join-Path (Get-DesktopFolder) 'TIVA Workstation.rdp')) '"TIVA Workstation" icon on this PC' 'Menu option 2'
    $ts = Get-TailscaleExe
    Show-Check ([bool]$ts) 'Tailscale installed on this PC' 'Menu option 2'
    $tsOn = $false
    if ($ts) { & $ts status *> $null; $tsOn = ($LASTEXITCODE -eq 0) }
    Show-Check $tsOn 'Tailscale signed in on this PC' 'Click the Tailscale icon near the clock and sign in'
    Show-Check (Test-Port $Workstation 3389) 'Azure workstation is on and reachable' 'Menu option 3 builds it; if it is built, it may be switched off for the night'
    $hq = $false
    try { $hq = (Invoke-WebRequest -Uri $HqUrl -UseBasicParsing -TimeoutSec 15).StatusCode -eq 200 } catch { }
    Show-Check $hq 'TIVA HQ website is up' 'Tell Claude'
}

# ------------------------------------------------------------------ 7. agents
# Agents that run on THIS PC can act for real: they use your internet and your
# Azure sign-in, so nothing blocks them.
function Invoke-Agents {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Say 'This PC has no Windows app installer (winget). Update "App Installer" from the Microsoft Store, then try again.' Red
        return
    }
    $tools = [ordered]@{
        'Git.Git'            = 'Git (agents need it)'
        'Microsoft.AzureCLI' = 'Azure CLI (lets agents build in your Azure)'
        'Python.Python.3.13' = 'Python (runs the TIVA workstation script)'
    }
    foreach ($id in $tools.Keys) {
        winget list --id $id --exact --accept-source-agreements *> $null
        if ($LASTEXITCODE -eq 0) { Say "[DONE]  $($tools[$id]) - already installed" Green; continue }
        Say "Installing $($tools[$id])... (click Yes if Windows asks)"
        winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements
        winget list --id $id --exact --accept-source-agreements *> $null
        if ($LASTEXITCODE -eq 0) { Say "[DONE]  $($tools[$id])" Green } else { Say "[NOT YET]  $($tools[$id])" Red }
    }
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

    $claude = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
    if (Test-Path $claude) { Say '[DONE]  Claude Code - already installed' Green }
    else {
        Say 'Installing Claude Code (the agent that runs commands on this PC)...'
        Start-Process powershell.exe -Wait -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex')
        if (Test-Path $claude) { Say '[DONE]  Claude Code' Green } else { Say '[NOT YET]  Claude Code' Red }
    }

    # The TIVA scripts, so the agents have everything they need.
    $repo = Join-Path $TivaHome 'tiva-hq'
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) { Say '[NOT YET]  Getting the TIVA scripts: Git is not ready. Close this window and run option 7 again.' Red }
    elseif (Test-Path (Join-Path $repo '.git')) {
        & git -C $repo pull --ff-only 2>&1 | Out-Null
        Say "[DONE]  TIVA scripts updated in $repo" Green
    } else {
        New-Item -ItemType Directory -Force -Path $TivaHome | Out-Null
        & git clone --branch claude/great-wright-tg49i4 https://github.com/dhanushanchan-hub/saas-admin-template $repo 2>&1 | Out-Null
        if (Test-Path (Join-Path $repo '.git')) { Say "[DONE]  TIVA scripts downloaded to $repo" Green }
        else { Say '[NOT YET]  Could not download the TIVA scripts (sign in to GitHub if a window asked).' Red }
    }

    if ((Read-Host '  Is JetBrains Air already installed on this PC? [Y/n]') -match '^[nN]') {
        Say 'Opening the JetBrains Air download page. Install it, then come back to these steps.' Yellow
        Start-Process 'https://air.dev/download'
    }
    Set-Clipboard -Value 'Read ops/founder-workstation/AGENT-TASK.md and do that task with me, step by step.'
    Write-Host ''
    Say 'Get Air running:' Green
    Say '1. Open JetBrains Air and sign in with your Claude account (the same one you use for Claude).'
    Say "2. Click Open and choose this folder:  $repo"
    Say '3. Start a new task, choose the Claude agent, press Ctrl+V to paste the job, and press Run.'
    Say '   (The job is already copied: "Read ops/founder-workstation/AGENT-TASK.md and do that task with me, step by step.")'
    Say '4. The agent asks before it runs anything on your PC. Read it, then approve.'
    Say '   If Air asks where to run the task, choose this computer (Docker is not needed).'
    Say "More ready-made jobs: $repo\ops\AIR-START.md"
    Say 'No Air? Same thing with Claude Code: open Terminal, type'
    Say "   cd `"$repo`"   then   claude   and paste the same sentence."
}

# ------------------------------------------------------------------ menu
while ($true) {
    Clear-Host
    Write-Host ''
    Write-Host '   T I V A   M A S T E R' -ForegroundColor Yellow
    Write-Host '   One place for the founder''s setup. Nothing is ever deleted.' -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '   1  Gather every file from Downloads and Desktop into one sorted folder (copies)'
    Write-Host '   2  Set up this PC to open the Azure workstation (desktop icon + Tailscale)'
    Write-Host '   3  Build the Azure workstation (opens Azure, everything ready to paste)'
    Write-Host '   4  Put the document vault on the Oracle computer (ready to paste)'
    Write-Host '   5  Check what is done'
    Write-Host '   6  Open TIVA HQ'
    Write-Host '   7  Get AI agents that act on this PC (JetBrains Air, Claude Code) + the TIVA scripts'
    Write-Host '   0  Close'
    Write-Host ''
    $choice = Read-Host '   Choose a number'
    Write-Host ''
    switch ($choice) {
        '1' { Invoke-Organise; Pause-Menu }
        '2' { Invoke-SetupPc; Pause-Menu }
        '3' {
            Invoke-Paste 'paste-azure-workstation*.txt' 'the Azure workstation builder' @(
                'Azure opens in your browser (sign in if asked). Choose Bash if it asks.',
                'Click inside the black window, then right-click and choose Paste (or press Ctrl+Shift+V).',
                'Press Enter. Pick a size from the price table, answer Y to raise your limit if asked,',
                'then type YES. When it says READY, send Claude a screenshot.'
            ) 'https://shell.azure.com'
            Pause-Menu
        }
        '4' {
            Invoke-Paste 'paste-vault-into-oracle-vm*.txt' 'the document vault installer' @(
                'Open Remote Desktop to your Oracle Ubuntu computer.',
                'On it, open Terminal, right-click inside it and choose Paste.',
                'Press Enter and choose your vault user name and password when it asks.',
                'When it says TIVA VAULT READY, open Firefox on that computer: http://127.0.0.1:8010'
            ) $null
            Pause-Menu
        }
        '5' { Invoke-Check; Pause-Menu }
        '6' { Start-Process $HqUrl }
        '7' { Invoke-Agents; Pause-Menu }
        '0' { exit }
    }
}
