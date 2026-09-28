<#
TIVA Desktop Setup: turns this Windows workstation into a clean, dark, premium
desktop and installs the founder's everyday apps.

It only ADDS and CHANGES SETTINGS: it never deletes files or apps, and it never
touches Remote Desktop access or the firewall. Safe to run again.

Run it by double-clicking "TIVA Desktop Setup" on the desktop, or:
  powershell -ExecutionPolicy Bypass -File C:\TIVA\tiva-desktop-setup.ps1

-MachineOnly applies the computer-wide part only (used once, automatically,
when the workstation is created).
#>
param([switch]$MachineOnly)

$ErrorActionPreference = 'Continue'
$Tiva = 'C:\TIVA'
$Wallpaper = Join-Path $Tiva 'tiva-wallpaper.png'
$Log = Join-Path $Tiva 'desktop-setup-log.txt'
New-Item -ItemType Directory -Force -Path $Tiva | Out-Null

# Machine settings need administrator rights: reopen as administrator if needed.
$me = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    if (-not $PSCommandPath) { Write-Host 'Please run this in PowerShell opened with "Run as administrator".'; exit 1 }
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    exit
}

$Results = New-Object System.Collections.Generic.List[string]

function Write-Log($text) {
    Add-Content -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss}  {1}" -f (Get-Date), $text) -Encoding UTF8
}

function Step($text) {
    Write-Host ''
    Write-Host "==> $text" -ForegroundColor Yellow
    Write-Log "==> $text"
}

function Done($text) {
    Write-Host "    OK   $text" -ForegroundColor Green
    $Results.Add("OK       $text")
    Write-Log "OK $text"
}

function Skip($text) {
    Write-Host "    --   $text" -ForegroundColor DarkGray
    $Results.Add("SKIPPED  $text")
    Write-Log "SKIPPED $text"
}

function Set-Reg($Path, $Name, $Value, $Type = 'DWord') {
    try {
        if (-not (Test-Path $Path)) { New-Item -Path $Path -Force | Out-Null }
        New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType $Type -Force -ErrorAction Stop | Out-Null
        return $true
    } catch {
        Write-Log "Could not set $Path\$Name : $_"
        return $false
    }
}

function New-TivaWallpaper($Path) {
    Add-Type -AssemblyName System.Drawing
    $w = 3840; $h = 2160
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # Deep navy to near-black.
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
    $dark = [System.Drawing.Color]::FromArgb(255, 4, 6, 12)
    $navy = [System.Drawing.Color]::FromArgb(255, 12, 26, 51)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $dark, $navy, ([single]35)
    $g.FillRectangle($bg, $rect)

    # A soft gold glow on the right.
    $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $glowPath.AddEllipse(2000, 700, 2800, 2200)
    $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush $glowPath
    $glow.CenterColor = [System.Drawing.Color]::FromArgb(60, 212, 175, 55)
    $glow.SurroundColors = [System.Drawing.Color[]]@([System.Drawing.Color]::FromArgb(0, 212, 175, 55))
    $g.FillPath($glow, $glowPath)

    # Fine gold lines.
    for ($i = 0; $i -lt 7; $i++) {
        $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(16 + $i * 5, 212, 175, 55)), ([single]2)
        $g.DrawLine($pen, 1900 + $i * 240, $h, $w, 620 + $i * 170)
        $pen.Dispose()
    }

    # The TIVA wordmark, letter-spaced, with a quiet subtitle.
    $gold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 212, 175, 55))
    $soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(170, 230, 232, 238))
    $pixel = [System.Drawing.GraphicsUnit]::Pixel
    $big = New-Object System.Drawing.Font 'Segoe UI Light', ([single]210), ([System.Drawing.FontStyle]::Regular), $pixel
    $small = New-Object System.Drawing.Font 'Segoe UI Semilight', ([single]42), ([System.Drawing.FontStyle]::Regular), $pixel
    $x = [single]250
    foreach ($ch in 'TIVA'.ToCharArray()) {
        $g.DrawString([string]$ch, $big, $gold, $x, [single]1380)
        $x += $g.MeasureString([string]$ch, $big).Width + 30
    }
    $g.DrawString('FAMILY HOLDING   |   FOUNDER WORKSTATION', $small, $soft, [single]275, [single]1660)

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$os = Get-CimInstance Win32_OperatingSystem
$isServer = $os.ProductType -ne 1
$hasNvidia = [bool](Get-CimInstance Win32_VideoController | Where-Object { $_.Name -like '*NVIDIA*' })
Write-Log "Start. $($os.Caption) $($os.Version). MachineOnly=$MachineOnly NVIDIA=$hasNvidia User=$env:USERNAME"

Write-Host ''
Write-Host '  TIVA Desktop Setup' -ForegroundColor Yellow
Write-Host "  $($os.Caption)  |  $env:NUMBER_OF_PROCESSORS cores  |  $([math]::Round($os.TotalVisibleMemorySize / 1MB)) GB RAM"

# ---------------------------------------------------------------- computer-wide
Step 'Computer-wide settings'

try { Set-TimeZone -Id 'India Standard Time' -ErrorAction Stop; Done 'Time zone: India (IST)' } catch { Skip 'Time zone' }

# Sharper, smoother Remote Desktop: 60 frames a second and full-colour H.264.
$ts = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
$set = @(
    (Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server\WinStations' 'DWMFRAMEINTERVAL' 15),
    (Set-Reg $ts 'AVC444ModePreferred' 1),
    (Set-Reg $ts 'AVCHardwareEncodePreferred' 1),
    (Set-Reg $ts 'fDisableAudioCapture' 0)
)
if ($hasNvidia) { $set += Set-Reg $ts 'bEnumerateHWBeforeSW' 1 }
if ($set -notcontains $false) {
    if ($hasNvidia) { Done 'Remote Desktop: 60 fps, sharp colour, NVIDIA GPU used for the screen, microphone allowed' }
    else { Done 'Remote Desktop: 60 fps, sharp colour, microphone allowed' }
} else { Skip 'Remote Desktop quality settings (see log)' }

$audioOk = $true
foreach ($svc in 'AudioEndpointBuilder', 'Audiosrv') {
    try { Set-Service -Name $svc -StartupType Automatic -ErrorAction Stop; Start-Service -Name $svc -ErrorAction Stop }
    catch { $audioOk = $false; Write-Log "Audio service $svc : $_" }
}
if ($audioOk) { Done 'Sound on (speakers and microphone through Remote Desktop)' } else { Skip 'Sound service (see log)' }

if ($isServer) {
    Set-Reg 'HKLM:\SOFTWARE\Microsoft\ServerManager' 'DoNotOpenServerManagerAtLogon' 1 | Out-Null
    Disable-ScheduledTask -TaskPath '\Microsoft\Windows\Server Manager\' -TaskName 'ServerManager' -ErrorAction SilentlyContinue | Out-Null
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Reliability' 'ShutdownReasonOn' 0 | Out-Null
    Done 'Server Manager no longer pops up; no "why are you shutting down" box'
}

powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Done 'Power plan: High performance' } else { Skip 'Power plan' }

if (Set-Reg 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' 'LongPathsEnabled' 1) { Done 'Long file paths allowed' }
if (Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Edge' 'HideFirstRunExperience' 1) { Done 'Edge opens without its welcome screens' }

try {
    if (-not (Test-Path $Wallpaper)) { New-TivaWallpaper $Wallpaper }
    Set-Reg 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Personalization' 'LockScreenImage' $Wallpaper 'String' | Out-Null
    Done "TIVA wallpaper created ($Wallpaper)"
} catch {
    Write-Log "Wallpaper: $_"
    Skip 'TIVA wallpaper'
}

if ($MachineOnly) {
    # Put a "TIVA Desktop Setup" icon on every user's desktop for the rest.
    try {
        $shell = New-Object -ComObject WScript.Shell
        $link = $shell.CreateShortcut('C:\Users\Public\Desktop\TIVA Desktop Setup.lnk')
        $link.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
        $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        $link.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
        $link.Description = 'Finish the TIVA premium desktop and install apps'
        $link.Save()
        Done 'Placed "TIVA Desktop Setup" on the desktop'
    } catch { Write-Log "Shortcut: $_"; Skip 'Desktop icon' }
    Write-Log 'Machine part finished.'
    Write-Host 'Computer-wide part finished.'
    exit 0
}

# ---------------------------------------------------------------- your look
Step 'Your look: dark, clean and premium'

$personalize = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize'
$set = @((Set-Reg $personalize 'AppsUseLightTheme' 0), (Set-Reg $personalize 'SystemUsesLightTheme' 0),
          (Set-Reg $personalize 'EnableTransparency' 1))
if ($set -notcontains $false) { Done 'Dark mode with glass effects' } else { Skip 'Dark mode (see log)' }

# Accent colour taken from the TIVA wallpaper, shown on Start, taskbar and title bars.
$set = @((Set-Reg 'HKCU:\Control Panel\Desktop' 'AutoColorization' 1), (Set-Reg $personalize 'ColorPrevalence' 1),
          (Set-Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'ColorPrevalence' 1))
if ($set -notcontains $false) { Done 'Accent colour matched to the wallpaper, on taskbar and window titles' }

if (Test-Path $Wallpaper) {
    Set-Reg 'HKCU:\Control Panel\Desktop' 'WallpaperStyle' '10' 'String' | Out-Null
    Set-Reg 'HKCU:\Control Panel\Desktop' 'TileWallpaper' '0' 'String' | Out-Null
    try {
        Add-Type -Namespace Tiva -Name Native -MemberDefinition @'
[DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
public static extern bool SystemParametersInfo(int uiAction, int uiParam, string pvParam, int fWinIni);
'@ -ErrorAction SilentlyContinue
        # SPI_SETDESKWALLPAPER, saved and broadcast to open windows.
        if ([Tiva.Native]::SystemParametersInfo(0x0014, 0, $Wallpaper, 3)) { Done 'TIVA wallpaper on your desktop' }
        else { Skip 'Setting the wallpaper' }
    } catch { Write-Log "Set wallpaper: $_"; Skip 'Setting the wallpaper' }
}

# Full visual quality (Windows Server starts with "best performance").
$desktop = 'HKCU:\Control Panel\Desktop'
$set = @(
    (Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 1),
    (Set-Reg $desktop 'UserPreferencesMask' ([byte[]](0x9E, 0x3E, 0x07, 0x80, 0x12, 0x00, 0x00, 0x00)) 'Binary'),
    (Set-Reg $desktop 'FontSmoothing' '2' 'String'),
    (Set-Reg $desktop 'FontSmoothingType' 2),
    (Set-Reg "$desktop\WindowMetrics" 'MinAnimate' '1' 'String'),
    (Set-Reg 'HKCU:\Software\Microsoft\Windows\DWM' 'EnableAeroPeek' 1)
)
if ($set -notcontains $false) { Done 'Smooth animations, shadows and ClearType text' } else { Skip 'Visual quality (see log)' }

# Taskbar and File Explorer.
$adv = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced'
$set = @((Set-Reg $adv 'TaskbarAl' 1), (Set-Reg $adv 'ShowTaskViewButton' 0),
          (Set-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'SearchboxTaskbarMode' 1))
# Widgets and Chat buttons: newer Windows may refuse these two; that's fine.
Set-Reg $adv 'TaskbarDa' 0 | Out-Null
Set-Reg $adv 'TaskbarMn' 0 | Out-Null
if ($set -notcontains $false) { Done 'Clean centred taskbar (search icon, no clutter)' } else { Skip 'Taskbar layout (see log)' }
if ((Set-Reg $adv 'HideFileExt' 0) -and (Set-Reg $adv 'LaunchTo' 1)) { Done 'File Explorer opens on This PC and shows file types (.pdf, .xlsx)' }

$cdm = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\ContentDeliveryManager'
$set = @(Set-Reg $adv 'Start_IrisRecommendations' 0)
foreach ($name in 'SubscribedContent-338388Enabled', 'SubscribedContent-338389Enabled', 'SubscribedContent-353694Enabled',
                  'SubscribedContent-353696Enabled', 'SystemPaneSuggestionsEnabled', 'SoftLandingEnabled') {
    $set += Set-Reg $cdm $name 0
}
if ($set -notcontains $false) { Done 'No tips, ads or suggestions' } else { Skip 'Turning off tips (see log)' }

try {
    Set-Culture -CultureInfo 'en-IN' -ErrorAction Stop
    Set-WinHomeLocation -GeoId 113 -ErrorAction Stop
    Done 'Indian formats: dates DD-MM-YYYY, Rupee, lakh/crore grouping'
} catch { Write-Log "Region: $_"; Skip 'Indian formats' }

# ---------------------------------------------------------------- apps
Step 'Free apps and tools (about 30-40 minutes for the full list; you can keep working)'

function Find-Winget {
    $cmd = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    try { Add-AppxPackage -RegisterByFamilyName -MainPackage Microsoft.DesktopAppInstaller_8wekyb3d8bbwe -ErrorAction Stop } catch { Write-Log "Register App Installer: $_" }
    $cmd = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    try {
        Write-Host '    Getting the Windows app installer (winget)...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope AllUsers -ErrorAction Stop | Out-Null
        Install-Module -Name Microsoft.WinGet.Client -Repository PSGallery -Force -Scope AllUsers -ErrorAction Stop
        Import-Module Microsoft.WinGet.Client -ErrorAction Stop
        Repair-WinGetPackageManager -AllUsers -Force -Latest -ErrorAction Stop | Out-Null
    } catch { Write-Log "winget repair: $_" }
    $cmd = Get-Command winget.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $local = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\winget.exe'
    if (Test-Path $local) { return $local }
    return $null
}

# Every one of these is free to install and use (some need a free account).
$Apps = [ordered]@{
    # Browsers
    'Google.Chrome'                     = 'Google Chrome'
    'Mozilla.Firefox'                   = 'Firefox'
    # AI
    'Anthropic.Claude'                  = 'Claude desktop app'
    'Ollama.Ollama'                     = 'Ollama (run AI models on this computer)'
    # Code and build
    'Microsoft.WindowsTerminal'         = 'Windows Terminal'
    'Microsoft.PowerShell'              = 'PowerShell 7'
    'Microsoft.VisualStudioCode'        = 'VS Code'
    'Anysphere.Cursor'                  = 'Cursor (AI code editor)'
    'Git.Git'                           = 'Git'
    'GitHub.cli'                        = 'GitHub CLI'
    'GitHub.GitHubDesktop'              = 'GitHub Desktop'
    'OpenJS.NodeJS.LTS'                 = 'Node.js'
    'Python.Python.3.13'                = 'Python'
    'Postman.Postman'                   = 'Postman (test APIs and integrations)'
    'dbeaver.dbeaver'                   = 'DBeaver (open any database)'
    # Cloud
    'Microsoft.AzureCLI'                = 'Azure CLI'
    'Cloudflare.cloudflared'            = 'Cloudflare Tunnel (cloudflared)'
    # Office and documents
    'TheDocumentFoundation.LibreOffice' = 'LibreOffice (Word, Excel, PowerPoint files)'
    'Adobe.Acrobat.Reader.64-bit'       = 'Adobe Acrobat Reader'
    'Notion.Notion'                     = 'Notion'
    'Obsidian.Obsidian'                 = 'Obsidian (notes)'
    'Google.GoogleDrive'                = 'Google Drive'
    # Design and video
    'Figma.Figma'                       = 'Figma'
    'Canva.Canva'                       = 'Canva'
    'OBSProject.OBSStudio'              = 'OBS Studio (record and stream video)'
    'VideoLAN.VLC'                      = 'VLC'
    'ShareX.ShareX'                     = 'ShareX (screenshots and screen recording)'
    # Talk to people
    'Zoom.Zoom'                         = 'Zoom'
    'SlackTechnologies.Slack'           = 'Slack'
    'Telegram.TelegramDesktop'          = 'Telegram'
    # Everyday utilities
    'Bitwarden.Bitwarden'               = 'Bitwarden (password manager)'
    'Microsoft.PowerToys'               = 'PowerToys'
    'voidtools.Everything'              = 'Everything (find any file instantly)'
    '7zip.7zip'                         = '7-Zip'
    'Notepad++.Notepad++'               = 'Notepad++'
}

$winget = Find-Winget
if (-not $winget) {
    Skip 'All apps: the Windows app installer (winget) is not available. Send me the log.'
} else {
    $n = 0
    foreach ($id in $Apps.Keys) {
        $n++
        $name = $Apps[$id]
        & $winget list --id $id --exact --accept-source-agreements --disable-interactivity 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Done "$name (already installed)"; continue }
        Write-Host "    ...  [$n/$($Apps.Count)] installing $name"
        & $winget install --id $id --exact --silent --accept-package-agreements --accept-source-agreements --disable-interactivity 2>&1 |
            Out-File -FilePath $Log -Append -Encoding utf8
        & $winget list --id $id --exact --accept-source-agreements --disable-interactivity 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { Done $name } else { Skip "$name (didn't install; details in the log)" }
    }
}

# Let this window see the programs just installed.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

# Command-line tools from Node.js: Cloudflare, and the free AI coding agents.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm -and (Test-Path "$env:ProgramFiles\nodejs\npm.cmd")) { $npm = Get-Item "$env:ProgramFiles\nodejs\npm.cmd" }
$npmTools = [ordered]@{
    'wrangler'          = 'Cloudflare Wrangler (deploy TIVA HQ, Workers, D1, R2)'
    '@openai/codex'     = 'OpenAI Codex CLI'
    '@google/gemini-cli' = 'Google Gemini CLI'
}
foreach ($pkg in $npmTools.Keys) {
    if (-not $npm) { Skip "$($npmTools[$pkg]) (needs Node.js)"; continue }
    Write-Host "    ...  installing $($npmTools[$pkg])"
    $npmPath = if ($npm.Source) { $npm.Source } else { $npm.FullName }
    & $npmPath install --global $pkg 2>&1 | Out-File -FilePath $Log -Append -Encoding utf8
    if ($LASTEXITCODE -eq 0) { Done $npmTools[$pkg] } else { Skip "$($npmTools[$pkg]) (details in the log)" }
}

# Oracle Cloud's command-line tool, from Python.
$python = @(
    "$env:LOCALAPPDATA\Programs\Python\Python313\python.exe",
    "$env:ProgramFiles\Python313\python.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $python) {
    Skip 'Oracle Cloud CLI (needs Python)'
} else {
    Write-Host '    ...  installing Oracle Cloud CLI'
    & $python -m pip install --upgrade oci-cli 2>&1 | Out-File -FilePath $Log -Append -Encoding utf8
    & $python -m pip show oci-cli 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        # Make "oci" work in any new terminal.
        $scripts = Join-Path (Split-Path $python) 'Scripts'
        $userPath = [string][Environment]::GetEnvironmentVariable('Path', 'User')
        if (($userPath -split ';') -notcontains $scripts) {
            [Environment]::SetEnvironmentVariable('Path', ($userPath.TrimEnd(';') + ';' + $scripts), 'User')
        }
        Done 'Oracle Cloud CLI (type: oci)'
    } else { Skip 'Oracle Cloud CLI (details in the log)' }
}

# Claude Code: the AI agent that works on your files and code from the terminal.
$claudeExe = Join-Path $env:USERPROFILE '.local\bin\claude.exe'
if ((Get-Command claude -ErrorAction SilentlyContinue) -or (Test-Path $claudeExe)) {
    Done 'Claude Code (already installed)'
} else {
    Write-Host '    ...  installing Claude Code'
    # Its official installer, in a separate window so it can't end this script.
    Start-Process powershell.exe -Wait -WindowStyle Hidden -ArgumentList @(
        '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex')
    if (Test-Path $claudeExe) { Done 'Claude Code (open Terminal and type: claude)' }
    else { Skip 'Claude Code (install it later from claude.com/claude-code)' }
}

# ---------------------------------------------------------------- links
Step 'TIVA links folder on your desktop'
$links = [ordered]@{
    'TIVA HQ'              = 'https://saas-admin-template.dhanush-anchan.workers.dev/login'
    'Azure Portal'         = 'https://portal.azure.com'
    'Oracle Cloud'         = 'https://cloud.oracle.com'
    'Cloudflare'           = 'https://dash.cloudflare.com'
    'GitHub'               = 'https://github.com/dhanushanchan-hub'
    'Claude'               = 'https://claude.ai'
    'GST Portal'           = 'https://www.gst.gov.in'
    'Income Tax'           = 'https://www.incometax.gov.in'
    'MCA (companies)'      = 'https://www.mca.gov.in'
    'NGO Darpan'           = 'https://ngodarpan.gov.in'
}
try {
    $folder = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TIVA Links'
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    foreach ($name in $links.Keys) {
        Set-Content -Path (Join-Path $folder "$name.url") -Value "[InternetShortcut]`r`nURL=$($links[$name])" -Encoding ASCII
    }
    Done "$($links.Count) links: TIVA HQ, Azure, Oracle, Cloudflare, GitHub, Claude, GST, Income Tax, MCA, NGO Darpan"
} catch { Write-Log "Links: $_"; Skip 'Links folder' }

# ---------------------------------------------------------------- finish
Step 'Summary'
$Results | ForEach-Object { Write-Host "    $_" }
Write-Log 'Finished.'

# Restart the taskbar and desktop so the new look shows now.
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue

Write-Host ''
Write-Host '  Done. For everything to show fully, sign out and sign back in once.' -ForegroundColor Green
Write-Host "  A record of this run is in $Log"
Read-Host '  Press Enter to close'
