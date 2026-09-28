# TIVA: turns this PC into the screen for your Azure workstation.
# Paste all of this into PowerShell on this PC (Start -> type PowerShell -> Enter).
# It adds a "TIVA Workstation" icon to your desktop and installs Tailscale.
# Nothing on this PC is deleted or changed otherwise.

$desk = [Environment]::GetFolderPath('Desktop')
$rdp = @'
full address:s:tiva-founder-desktop
username:s:tivafounder
screen mode id:i:2
use multimon:i:0
dynamic resolution:i:1
smart sizing:i:1
session bpp:i:32
connection type:i:7
networkautodetect:i:1
bandwidthautodetect:i:1
autoreconnection enabled:i:1
audiomode:i:0
audiocapturemode:i:1
videoplaybackmode:i:1
camerastoredirect:s:*
redirectclipboard:i:1
redirectprinters:i:1
drivestoredirect:s:*
allow font smoothing:i:1
allow desktop composition:i:1
disable wallpaper:i:0
disable full window drag:i:0
disable menu anims:i:0
disable themes:i:0
bitmapcachepersistenable:i:1
authentication level:i:2
enablecredsspsupport:i:1
'@
Set-Content -Path (Join-Path $desk 'TIVA Workstation.rdp') -Value $rdp -Encoding Unicode
Write-Host 'Added "TIVA Workstation" to your desktop.' -ForegroundColor Green

if ((Test-Path "$env:ProgramFiles\Tailscale\tailscale.exe") -or (Test-Path "${env:ProgramFiles(x86)}\Tailscale\tailscale.exe")) {
    Write-Host 'Tailscale is already installed.' -ForegroundColor Green
} elseif (Get-Command winget -ErrorAction SilentlyContinue) {
    Write-Host 'Installing Tailscale (click Yes if Windows asks)...'
    winget install --id Tailscale.Tailscale --exact --silent --accept-package-agreements --accept-source-agreements
} else {
    Write-Host 'Opening the Tailscale download page: install it, then come back.' -ForegroundColor Yellow
    Start-Process 'https://tailscale.com/download/windows'
}
Write-Host ''
Write-Host 'Next: click the Tailscale icon near the clock, sign in with the SAME account you used'
Write-Host 'for the Azure workstation, then double-click "TIVA Workstation" on your desktop.'
