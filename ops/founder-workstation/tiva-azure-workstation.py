#!/usr/bin/env python3
"""Creates the TIVA founder workstation: a Windows VM in Azure Central India.

Run it in Azure Cloud Shell (Bash). It shows real prices and your Azure limits
first, asks you to choose, and creates nothing until you type YES. If your
Azure limit is too low for the size you want, it can ask Azure to raise it.

Security: nothing on the VM is reachable from the internet. You connect over
Tailscale (your private network), or from your own internet address only.
Your existing VMs are not touched. Safe to run again: if the workstation
already exists, it only finishes its setup.

For a helper running it without a keyboard: TIVA_ADMIN_PASSWORD and
TIVA_TAILSCALE_KEY in the environment replace the two hidden prompts.
"""
import getpass
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

REGION = "centralindia"
GROUP = "rg-tiva-founder-desktop"
VM = "tiva-founder-desktop"
ADMIN = "tivafounder"
HOURS_PER_MONTH = 730

SIZES = [
    ("Standard_D8ads_v6", 8, 32, "Same power as your current tiva-win11"),
    ("Standard_D16ads_v6", 16, 64, "Powerful (recommended)"),
    ("Standard_D16ads_v5", 16, 64, "Powerful, previous generation"),
    ("Standard_D32ads_v6", 32, 128, "Very powerful"),
    ("Standard_D32ads_v5", 32, 128, "Very powerful, previous generation"),
    ("Standard_D48ads_v6", 48, 192, "Extreme"),
    ("Standard_D64ads_v6", 64, 256, "Top end"),
    ("Standard_D96ads_v6", 96, 384, "Maximum"),
    ("Standard_NV36ads_A10_v5", 36, 440, "Top end + full NVIDIA A10 GPU (smoothest screen, AI, video)"),
]
IMAGES = {
    "server": ("MicrosoftWindowsServer", "WindowsServer",
               ["2025-datacenter-azure-edition", "2025-datacenter-g2", "2022-datacenter-azure-edition"]),
    "win11": ("MicrosoftWindowsDesktop", "windows-11",
              ["win11-25h2-ent", "win11-24h2-ent"]),
}

# The TIVA Desktop Setup script (gzip + base64). It is copied onto the
# workstation, applies the computer-wide settings, and leaves a
# "TIVA Desktop Setup" icon on the desktop for the rest.
DESKTOP_SETUP = "__DESKTOP_SETUP__"


def az(*args, capture=True):
    """Runs an Azure CLI command. With capture, returns parsed JSON or None."""
    if not capture:
        return subprocess.run(["az", *args, "--only-show-errors"]).returncode == 0
    result = subprocess.run(["az", *args, "-o", "json", "--only-show-errors"],
                            capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout) if result.stdout.strip() else {}
    except ValueError:
        return None


def run_on_vm(script):
    """Runs PowerShell on the workstation (as the system). Returns its output text."""
    result = az("vm", "run-command", "invoke", "--resource-group", GROUP, "--name", VM,
                "--command-id", "RunPowerShellScript", "--scripts", script)
    return " ".join(v.get("message", "") for v in (result or {}).get("value", []))


def price_per_hour(size):
    """Official Azure pay-as-you-go prices in INR: (windows_server, no_licence)."""
    flt = (f"serviceName eq 'Virtual Machines' and armRegionName eq '{REGION}' "
           f"and armSkuName eq '{size}' and priceType eq 'Consumption'")
    url = ("https://prices.azure.com/api/retail/prices?currencyCode=INR&$filter="
           + urllib.parse.quote(flt))
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            items = json.load(response).get("Items", [])
    except Exception:
        return None, None
    items = [i for i in items if "Spot" not in i.get("skuName", "") and "Low Priority" not in i.get("skuName", "")]
    windows = [i["retailPrice"] for i in items if "Windows" in i.get("productName", "")]
    other = [i["retailPrice"] for i in items if "Windows" not in i.get("productName", "")]
    return (min(windows) if windows else None), (min(other) if other else None)


def limit_and_free(entry):
    """(limit, cores still free) for one Azure limit, or (None, None) if unknown."""
    try:
        limit = int(float(entry["limit"]))
        return limit, limit - int(float(entry["currentValue"]))
    except (KeyError, TypeError, ValueError):
        return None, None


def read_usage():
    return {u["name"]["value"]: u for u in az("vm", "list-usage", "--location", REGION) or []}


def shortfalls(family, cores, usage):
    """Azure limits too low for `cores` more: [(quota name, label, limit now, limit needed)]."""
    short = []
    for name, label in ((family, f"'{family}' vCPUs"), ("cores", "'Total Regional vCPUs'")):
        if name in usage:
            limit, free = limit_and_free(usage[name])
            if free is not None and free < cores:
                short.append((name, label, limit, limit - free + cores))
    return short


def raise_limits(short):
    """Asks Azure to raise the limits, then waits up to 10 minutes. True once they're high enough."""
    sub = (az("account", "show") or {}).get("id")
    if not sub:
        print("Couldn't read your subscription.")
        return False
    print("==> Enabling Azure's quota service (one time, about a minute)")
    az("provider", "register", "--namespace", "Microsoft.Quota", "--wait")
    for name, label, limit, needed in short:
        url = (f"https://management.azure.com/subscriptions/{sub}/providers/Microsoft.Compute/locations/{REGION}"
               f"/providers/Microsoft.Quota/quotas/{name}?api-version=2023-02-01")
        body = {"properties": {"limit": {"limitObjectType": "LimitValue", "value": needed}, "name": {"value": name}}}
        result = subprocess.run(["az", "rest", "--method", "put", "--url", url, "--body", json.dumps(body),
                                 "--only-show-errors"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"==> Asked Azure to raise {label} from {limit} to {needed}")
        else:
            print(f"Azure didn't accept the request for {label}:\n  {(result.stderr or result.stdout).strip()[-400:]}")
            return False
    print("==> Waiting for Azure's answer (up to 10 minutes)", end="", flush=True)
    for _ in range(30):
        time.sleep(20)
        usage = read_usage()
        still = [s for s in short if (limit_and_free(usage.get(s[0], {}))[0] or 0) < s[3]]
        if not still:
            print("\n==> Approved. Your new limits are active.")
            return True
        print(".", end="", flush=True)
    print("\nAzure is still reviewing the request (large and GPU requests can take up to a few days).")
    return False


def secret(prompt, env_name):
    """A hidden answer, or the value of env_name when it is set."""
    return os.environ.get(env_name) or getpass.getpass(prompt)


def ask(prompt, default=""):
    answer = input(f"{prompt} ").strip()
    return answer or default


def money(value):
    return "?" if value is None else f"Rs {value:,.0f}"


def setup_tailscale(key):
    print("==> Installing Tailscale on the workstation (a few minutes)")
    script = (
        "$ErrorActionPreference='Stop';"
        "Invoke-WebRequest -UseBasicParsing https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi -OutFile $env:TEMP\\ts.msi;"
        "Start-Process msiexec.exe -Wait -ArgumentList '/i', \"$env:TEMP\\ts.msi\", '/quiet';"
        "Start-Sleep -Seconds 15;"
        f"& 'C:\\Program Files\\Tailscale\\tailscale.exe' up --authkey={key} --unattended --hostname={VM};"
        "Enable-NetFirewallRule -DisplayGroup 'Remote Desktop';"
        "& 'C:\\Program Files\\Tailscale\\tailscale.exe' ip -4"
    )
    ts_ip = next((w for w in run_on_vm(script).split() if w.startswith("100.")), "")
    if ts_ip:
        print(f"==> Tailscale is on. The workstation's private address: {ts_ip}")
    else:
        print("==> Tailscale didn't confirm. Send me this output and I'll fix it.")


def install_gpu_driver():
    print("==> Installing the NVIDIA A10 graphics driver (10-15 minutes; the workstation restarts once)")
    ok = az("vm", "extension", "set", "--resource-group", GROUP, "--vm-name", VM,
            "--name", "NvidiaGpuDriverWindows", "--publisher", "Microsoft.HpcCompute", capture=False)
    print("==> NVIDIA driver installed" if ok else "==> The NVIDIA driver didn't install. Send me the message above.")


def place_desktop_setup():
    print("==> Preparing the premium desktop on the workstation (about 2 minutes)")
    script = (
        "$ErrorActionPreference='Stop';"
        "New-Item -ItemType Directory -Force -Path C:\\TIVA | Out-Null;"
        f"$gz=[Convert]::FromBase64String('{DESKTOP_SETUP}');"
        "$in=New-Object IO.MemoryStream(,$gz);"
        "$unzip=New-Object IO.Compression.GzipStream($in,[IO.Compression.CompressionMode]::Decompress);"
        "$out=New-Object IO.MemoryStream;$unzip.CopyTo($out);"
        "[IO.File]::WriteAllBytes('C:\\TIVA\\tiva-desktop-setup.ps1',$out.ToArray());"
        "& powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\TIVA\\tiva-desktop-setup.ps1 -MachineOnly"
    )
    if "Computer-wide part finished" in run_on_vm(script):
        print("==> Done: IST time, 60 fps Remote Desktop, sound, TIVA wallpaper, and a")
        print("    'TIVA Desktop Setup' icon on its desktop for the rest (looks + apps).")
    else:
        print("==> The desktop preparation didn't confirm. It can be run by hand later; send me this output.")


def finish(size, ask_tailscale):
    """Everything after the VM exists. Safe to repeat."""
    if ask_tailscale and ask("\nSet up Tailscale on it now? [y/N]:", "n").lower().startswith("y"):
        key = secret("Paste your Tailscale auth key (hidden): ", "TIVA_TAILSCALE_KEY").strip()
        if key.startswith("tskey-"):
            setup_tailscale(key)
        else:
            print("That doesn't look like a Tailscale key (it starts with tskey-). Skipped.")
    if size.startswith("Standard_NV"):
        install_gpu_driver()
    place_desktop_setup()


def ready(address):
    print("\n================ READY ================")
    print("On your PC: double-click 'TIVA Workstation' on the desktop (from the local PC paste).")
    print(f"  Computer: {address}   User name: {ADMIN}   Password: the one you chose")
    print("Inside the workstation, the first time: double-click 'TIVA Desktop Setup' and click Yes.")
    print("Your old tiva-win11 in West US is untouched. We'll move your files over, then decide about it together.")


def main():
    existing = az("vm", "show", "--resource-group", GROUP, "--name", VM)
    if existing:
        size = existing.get("hardwareProfile", {}).get("vmSize", "?")
        print(f"\nYour workstation {VM} already exists ({size}). Nothing new will be created.")
        if not ask("Finish its setup (premium desktop, and the GPU driver if it has a GPU)? [Y/n]:", "y").lower().startswith("y"):
            return
        az("vm", "start", "--resource-group", GROUP, "--name", VM)
        finish(size, ask_tailscale=True)
        ready(VM)
        return

    print("\n==> Checking prices and your Azure limits in Central India (about a minute)...")
    skus = az("vm", "list-skus", "--location", REGION, "--resource-type", "virtualMachines", "--all") or []
    by_name = {s.get("name"): s for s in skus}
    usage = read_usage()

    rows = []
    for size, cores, ram, note in SIZES:
        sku = by_name.get(size)
        # Only a region-wide ("Location") restriction blocks it. Zone restrictions
        # don't matter because the VM isn't pinned to a zone.
        available = bool(sku) and not any(
            r.get("type") == "Location" and r.get("reasonCode") == "NotAvailableForSubscription"
            for r in sku.get("restrictions", [])
        )
        family = (sku or {}).get("family")
        windows, plain = price_per_hour(size)
        rows.append({"size": size, "cores": cores, "ram": ram, "note": note, "available": available,
                     "family": family, "short": shortfalls(family, cores, usage),
                     "windows": windows, "plain": plain})

    biggest = max((n for n, r in enumerate(rows, 1) if r["available"] and not r["short"]), default=None)
    print("\nWorkstation options in Central India (official prices, Windows Server licence included):\n")
    print(f"{'#':<3}{'Size':<26}{'Cores':>6}{'RAM GB':>8}{'Per hour':>11}{'Month 24x7':>13}{'Off at night':>14}  Notes")
    for n, row in enumerate(rows, 1):
        hourly = row["windows"]
        month = hourly * HOURS_PER_MONTH if hourly else None
        night = hourly * HOURS_PER_MONTH * 16 / 24 if hourly else None
        status = ""
        if not row["available"]:
            status = "  <- NOT offered to you here"
        elif row["short"]:
            status = "  <- needs an Azure limit increase (this script can ask for it)"
        elif n == biggest:
            status = "  <- biggest you can create right now"
        print(f"{n:<3}{row['size']:<26}{row['cores']:>6}{row['ram']:>8}{money(hourly):>11}{money(month):>13}{money(night):>14}  {row['note']}{status}")
    print("\n'Off at night' = switched off 11 PM to 7 AM. Disk storage adds roughly Rs 1,500-3,000 a month.")

    choice = ask("\nChoose a number [2]:", "2")
    if not choice.isdigit() or not 1 <= int(choice) <= len(rows):
        print("Not a valid choice. Nothing was created.")
        return
    pick = rows[int(choice) - 1]
    if not pick["available"]:
        print("That size isn't offered to your subscription in Central India. Nothing was created.")
        return
    if pick["short"]:
        print("\nYour Azure limit is too low for that size:")
        for _, label, limit, needed in pick["short"]:
            print(f"  - {label}: limit {limit}, needs {needed}")
        print("Raising a limit is free; you only pay for what you run.")
        if not ask("Ask Azure to raise it now? [Y/n]:", "y").lower().startswith("y") or not raise_limits(pick["short"]):
            print("\nNothing was created. You can also ask in the portal: search 'Quotas' -> Compute ->")
            print("Region: Central India -> the rows above -> 'New quota request'. Then run this again.")
            return

    print("\nWindows version:")
    print("  1) Windows Server 2025 Datacenter: licence included in the price above (recommended)")
    print("  2) Windows 11 Enterprise: ONLY if you own Microsoft 365 E3/E5 or Windows Enterprise E3/E5 licences")
    os_choice = ask("Choose [1]:", "1")
    image_key = "win11" if os_choice == "2" else "server"
    publisher, offer, preferred = IMAGES[image_key]
    offered = {s.get("name") for s in az("vm", "image", "list-skus", "--location", REGION,
                                          "--publisher", publisher, "--offer", offer) or []}
    image_sku = next((s for s in preferred if s in offered), None)
    if not image_sku:
        print("That Windows image isn't available in Central India right now. Nothing was created.")
        return
    image = f"{publisher}:{offer}:{image_sku}:latest"
    hourly = pick["plain"] if image_key == "win11" else pick["windows"]

    night_off = ask("\nSwitch it off automatically at 11 PM every night to save money? [Y/n]:", "y").lower().startswith("y")

    print("\nHow you'll connect (nothing is open to the internet either way):")
    print("  1) Tailscale, your private network (recommended). Get a one-time key at")
    print("     login.tailscale.com/admin/settings/keys -> Generate auth key.")
    print("  2) Only from your own internet address (Google 'what is my IP' on your PC).")
    connect = ask("Choose [1]:", "1")
    tailscale_key, my_ip = "", ""
    if connect == "2":
        my_ip = ask("Your internet address (like 49.37.12.34):")
        if not my_ip.count(".") == 3:
            print("That doesn't look like an internet address. Nothing was created.")
            return
    else:
        tailscale_key = secret("Paste your Tailscale auth key (hidden): ", "TIVA_TAILSCALE_KEY").strip()
        if not tailscale_key.startswith("tskey-"):
            print("That doesn't look like a Tailscale key (it starts with tskey-). Nothing was created.")
            return

    print("\n================ Summary ================")
    print(f"Name:        {VM}, in a new group {GROUP} (Central India)")
    print(f"Size:        {pick['size']}: {pick['cores']} cores, {pick['ram']} GB RAM")
    print(f"Windows:     {image}")
    print(f"Disk:        256 GB Premium SSD")
    print(f"Price:       {money(hourly)} per hour, about {money(hourly * HOURS_PER_MONTH * (16 / 24 if night_off else 1) if hourly else None)} a month")
    print(f"Night off:   {'yes, 11 PM IST' if night_off else 'no'}")
    print(f"Access:      {'Tailscale only' if tailscale_key else 'remote desktop from ' + my_ip + ' only'}")
    print(f"Desktop:     premium TIVA setup{', NVIDIA driver' if pick['size'].startswith('Standard_NV') else ''}")
    print("Your existing VMs are not touched.")
    if ask("\nType YES to create it:") != "YES":
        print("Nothing was created.")
        return

    print(f"\n==> Creating {GROUP}")
    if az("group", "create", "--name", GROUP, "--location", REGION,
          "--tags", "owner=founder", "purpose=workstation") is None:
        print("Couldn't create the resource group. Stopping.")
        return

    password = os.environ.get("TIVA_ADMIN_PASSWORD", "")
    if password:
        print(f"==> Creating {VM} with the Windows password you were given")
    else:
        print(f"==> Creating {VM}. Choose its Windows password when asked:")
        print("    12+ characters with upper case, lower case, a number and a symbol. Save it in your password manager.")
    create = [
        "vm", "create", "--resource-group", GROUP, "--name", VM, "--location", REGION,
        "--image", image, "--size", pick["size"], "--admin-username", ADMIN,
        "--os-disk-size-gb", "256", "--storage-sku", "Premium_LRS",
        "--public-ip-sku", "Standard", "--nsg-rule", "NONE",
        "--security-type", "TrustedLaunch", "--enable-secure-boot", "true", "--enable-vtpm", "true",
        "--tags", "owner=founder", "purpose=workstation",
    ]
    if image_key == "win11":
        create += ["--license-type", "Windows_Client"]
    if password:
        create += ["--admin-password", password]
    if not az(*create, capture=False):
        print("Creating the VM failed (see the message above). Nothing else was changed.")
        return

    if night_off:
        # 11 PM IST is 17:30 UTC.
        az("vm", "auto-shutdown", "--resource-group", GROUP, "--name", VM, "--time", "1730")
        print("==> Night switch-off set for 11 PM IST")

    address = VM
    if my_ip:
        az("network", "nsg", "rule", "create", "--resource-group", GROUP, "--nsg-name", f"{VM}NSG",
           "--name", "rdp-founder-only", "--priority", "1000", "--direction", "Inbound", "--access", "Allow",
           "--protocol", "Tcp", "--source-address-prefixes", f"{my_ip}/32", "--destination-port-ranges", "3389")
        found = az("vm", "list-ip-addresses", "--resource-group", GROUP, "--name", VM) or []
        public = [ip.get("ipAddress") for entry in found
                  for ip in entry.get("virtualMachine", {}).get("network", {}).get("publicIpAddresses", [])]
        address = next((ip for ip in public if ip), VM)
        print(f"==> Remote desktop allowed only from {my_ip}. Workstation address: {address}")
    else:
        setup_tailscale(tailscale_key)

    finish(pick["size"], ask_tailscale=False)
    ready(address)


try:
    main()
except (KeyboardInterrupt, EOFError):
    print("\nStopped. Nothing further was created.")
    sys.exit(1)
