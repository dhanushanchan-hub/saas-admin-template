# Founder workstation (Azure, Central India)

A Windows workstation for the founder, used from the old PC over Remote Desktop.

| File | Runs where | What it does |
|---|---|---|
| `tiva-azure-workstation.py` | Azure Cloud Shell, or anywhere `az` is signed in | Shows sizes with real INR prices, can ask Azure to raise a vCPU limit, creates the VM (nothing open to the internet), turns on Tailscale, installs the NVIDIA driver on GPU sizes, and places the desktop setup on it. Creates nothing until you type `YES`. Safe to re-run. |
| `tiva-desktop-setup.ps1` | Inside the workstation | Dark premium look with the TIVA wallpaper, 60 fps Remote Desktop, sound, India time and formats, 35 free apps, Cloudflare/Oracle/Azure CLIs and the Claude Code, Codex and Gemini agents. Never deletes anything. |
| `local-pc-setup.ps1` | The founder's own PC | Adds the "TIVA Workstation" Remote Desktop icon and installs Tailscale. |
| `build-paste.sh` | Here | Builds `paste-azure-workstation.txt` (the creator with the desktop script embedded). |

Without a keyboard (for a helper session): set `TIVA_ADMIN_PASSWORD` and
`TIVA_TAILSCALE_KEY`, run `bash build-paste.sh /tmp/ws.txt`, then feed the
answers to `python3 /tmp/ws.py` on stdin.

The Oracle document vault installer is in `../oracle-vault/`.
