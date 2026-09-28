# Agent task: build the founder's Azure workstation from this PC

For an AI agent (Claude Code, Codex, Gemini or Junie, in JetBrains Air or a
terminal) running on the founder's own Windows PC, inside this repository.
The founder is non-technical: talk to him in short, plain sentences, say what
you're doing, and show proof. He pays the bill and wants the top-end machine
he can actually get.

## What's here
- `tiva-azure-workstation.py` creates a Windows VM in Azure Central India:
  - shows sizes with real INR prices;
  - can ask Azure to raise a vCPU limit;
  - turns on Tailscale-only access (nothing open to the internet);
  - installs the NVIDIA driver on the GPU size;
  - places `tiva-desktop-setup.ps1` on it, with a "TIVA Desktop Setup" icon on the VM's desktop.

  It embeds the desktop script itself when run from this folder, and on Windows it calls the Azure CLI's own Python.
- `TIVA_ADMIN_PASSWORD` and `TIVA_TAILSCALE_KEY` in the environment replace its two hidden prompts. The other answers come from stdin in this order:
  1. size number;
  2. `y` to "Ask Azure to raise it now?". This question appears only if the limit is too low.
  3. `1` for Windows Server 2025 (licence included);
  4. `y` for night switch-off;
  5. `1` for Tailscale;
  6. `YES`.
- `local-pc-setup.ps1` gives this PC the "TIVA Workstation" icon and Tailscale. The founder's TIVA-Master.cmd does the same (option 2).

## Steps
1. **Tools.** Check that `az version` and `python --version` work. If not, run:
   - `winget install --id Microsoft.AzureCLI -e --silent --accept-package-agreements --accept-source-agreements`
   - `winget install --id Python.Python.3.13 -e --silent --accept-package-agreements --accept-source-agreements`

   Open a new terminal afterwards so PATH updates.
2. **Sign in.** Run `az login`: a browser opens and he signs in. Then `az account show`. If `az account list` shows more than one subscription, ask which one he pays for, then `az account set --subscription <id>`.
3. **Show the options.**
   - Run `echo 99 | python ops/founder-workstation/tiva-azure-workstation.py`. It prints the size and price table, then stops without creating anything.
   - Show him: size, cores, RAM, rupees per month with night switch-off, and which sizes need a limit raise.
   - Be honest: above 16 cores a remote desktop doesn't feel faster for browser, office or AI-tool work. The GPU size gives the smoothest screen. GPU limit requests often need Microsoft review, which can take days.
   - Get his explicit YES to the exact size and monthly rupee cost before creating anything.
4. **Password and Tailscale key.**
   - Generate a strong 20-character Windows password with Python's `secrets`: upper case, lower case, digits and a symbol. Show it to him once and tell him to save it now, for example in Bitwarden.
   - Never write it to a file or commit.
   - Ask for a Tailscale auth key: login.tailscale.com, then Settings, Keys, Generate auth key.
5. **Create.**
   - Run the script with the env vars set only for that process and his answers on stdin. Keep the output in a log in `%TEMP%`.
   - It takes 15–40 minutes; the GPU driver takes longer. Give short progress updates.
   - If a limit raise is still under review, say so plainly. Offer the biggest size available now, which can be resized later.
6. **Verify with proof.**
   - `az vm get-instance-view -g rg-tiva-founder-desktop -n tiva-founder-desktop` shows it's running.
   - `az vm run-command invoke ... --command-id RunPowerShellScript` confirms `C:\TIVA\tiva-desktop-setup.ps1` and `C:\Users\Public\Desktop\TIVA Desktop Setup.lnk` exist, the time zone is IST, and `tailscale ip -4` returns an address.
   - On a GPU size, `nvidia-smi` works.
   - The network security group has no inbound rule open to the internet.
7. **Hand over.**
   1. Make sure this PC has Tailscale signed in with the same account.
   2. Make sure the "TIVA Workstation" icon is on the desktop (run `local-pc-setup.ps1` if not).
   3. He double-clicks the icon, logs in as `tivafounder`, then double-clicks "TIVA Desktop Setup" inside and clicks Yes. That's about 40 minutes of installs.
   4. He signs out and back in once.

## Rules
- Never delete, stop or change existing Azure resources. His `tiva-win11` VM in West US and everything else stay untouched. Only create in `rg-tiva-founder-desktop` in `centralindia`.
- Never open RDP or any port to the internet. Never put the password or Tailscale key in files, commits or chat logs you save.
- Nothing that costs money without his explicit YES to the size and price.
