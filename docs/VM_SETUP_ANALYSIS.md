# Azure VM Setup — Deep End-to-End Analysis Report

**Report scope:** Full posture review of the two Azure Virtual Machines in `Azure subscription 1`
(`e648ece2-9bbe-4ff5-80b3-fa03d39bbe20`) as exported on 2026-09-29 from the Azure Portal
`VirtualMachines_BrowseResourceBlade`.

**Source of truth:** the attached `AzureVirtualMachines.csv` export (2 rows).

**Deliverables produced by this run:**
1. This end-to-end report (findings, deep-dive per VM, cost model, security posture,
   governance, remediation plan).
2. `scripts/azure-vm-remediate.sh` — an auto-remediation runbook that applies every
   safe fix in this report via Azure CLI, idempotently.
3. `scripts/policies/*.json` — Azure Policy definitions that prevent regressions
   (deny-untagged, audit-missing-assessment, deny-public-ip-on-nic).

---

## 1 · Executive Summary

| Metric | Value |
|---|---|
| VMs in inventory | 2 |
| Running | 2 / 2 (100 %) |
| Regions in use | 2 (Central India, West US 2) |
| Public IPs exposed | 2 / 2 (100 %) — direct exposure, no Bastion in scope |
| Update Manager periodic assessment | **0 / 2 enabled** (both prompt “Enable periodic assessment”) |
| Modern hardware (v6 / AMD Genoa) | 2 / 2 (good) |
| Estimated pay-as-you-go compute | **≈ US$ 577 / month** (≈ US$ 6.9 k / yr) — see §5 |
| Highest-severity finding | **F-01: Both VMs have no automated patch assessment** (High) |

**Top three risks, in order:**

1. **Patch blind-spot** — neither VM has periodic assessment on, so missing OS patches are
   invisible in Update Manager. This is the single most impactful auto-fixable gap.
2. **Direct public-IP exposure** — both VMs carry a static public IPv4. Without an
   inspected NSG rule set, the standard assumption is SSH/22 (Linux) and RDP/3389
   (Windows) are reachable from the Internet — a well-known brute-force surface.
3. **No visible backup or DR posture** in the export — a Recovery Services Vault is not
   referenced. A ransomware event or a portal-side accidental delete has no recovery
   floor today.

Everything below is auto-remediable with the runbook in `scripts/azure-vm-remediate.sh`,
except items that require a human decision (region consolidation, sizing changes,
Reserved Instance purchase).

---

## 2 · Inventory (decoded from CSV)

| # | Name | RG | Region | OS | Size | Public IP | Disks | Status | Update Mgr |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `tiva-control-linux` | `rg-tiva-master` | Central India | Linux | `Standard_D4as_v6` | `20.219.7.113` | 1 | Running | **Not assessed** |
| 2 | `tiva-win11` | `RG-TIVA-AZURE-RD` | West US 2 | Windows | `Standard_D8ads_v6` | `20.230.136.75` | 3 | Running | **Not assessed** |

**Resource IDs (from the CSV `Resource Link` column):**

- `/subscriptions/e648ece2-9bbe-4ff5-80b3-fa03d39bbe20/resourceGroups/rg-tiva-master/providers/Microsoft.Compute/virtualMachines/tiva-control-linux`
- `/subscriptions/e648ece2-9bbe-4ff5-80b3-fa03d39bbe20/resourceGroups/RG-TIVA-AZURE-RD/providers/Microsoft.Compute/virtualMachines/tiva-win11`

**Naming observations:**

- Same org prefix `tiva-*` on both VMs — good.
- **Resource-group casing is inconsistent** (`rg-tiva-master` lowercase vs
  `RG-TIVA-AZURE-RD` uppercase). Azure ARM is case-insensitive on RG names, but the
  display casing “sticks” from whichever create call ran first and shows up in every
  export, policy report and cost line. Recommend a policy: `^rg-[a-z0-9-]+$`.

---

## 3 · Deep-dive per VM

### 3.1 `tiva-control-linux` — Central India

| Field | Value |
|---|---|
| Size family | **Dasv6** (general-purpose, AMD EPYC 9004 “Genoa”) |
| vCPU / RAM | 4 vCPU / 16 GiB |
| Local temp disk | **None** (Dasv6 has no local temp — all IO via remote managed disks) |
| Max remote IOPS / throughput | 12 500 IOPS / ≈ 190 MBps |
| Accelerated networking | Supported and default-on for this SKU |
| Attached disks | 1 (assumed: OS disk only, from the CSV column) |
| Public IP | `20.219.7.113` (static — Azure allocates from a fixed pool) |

**Purpose (inferred from the name `-control-`):** a control-plane host (bastion, ops-jump,
build agent, or master node for a self-managed cluster). This class of VM is typically
online 24×7 → **best candidate for a 1- or 3-year Reserved Instance**.

**Right-sizing note:** at 4 vCPU / 16 GiB this is already a small SKU; downshift to
`Standard_D2as_v6` (2 vCPU / 8 GiB) only after confirming CPU credit under 25 % for a
30-day window (needs VM Insights — see F-04).

### 3.2 `tiva-win11` — West US 2

| Field | Value |
|---|---|
| Size family | **Dadsv6** (general-purpose, AMD Genoa, **with local NVMe temp**) |
| vCPU / RAM | 8 vCPU / 32 GiB |
| Local temp disk | ≈ 300 GB NVMe (ephemeral, wiped on stop-deallocate) |
| Max remote IOPS / throughput | 25 000 IOPS / ≈ 380 MBps |
| Attached disks | 3 (typical Win11 desktop: OS + data + a swap/scratch disk) |
| Public IP | `20.230.136.75` |
| Windows license | **Included in PAYG rate** unless Azure Hybrid Benefit (AHB) is applied |

**Purpose (inferred from the RG name `-AZURE-RD`):** an interactive Remote-Desktop
workstation. This is almost never in use 24×7 → **top candidate for auto-shutdown**
and **candidate for Azure Hybrid Benefit** if a qualifying Windows license exists.

**Right-sizing note:** if this VM services one developer, 8 vCPU / 32 GiB is generous.
Consider `Standard_D4ads_v6` (4 vCPU / 16 GiB) — that alone saves ≈ 50 % of the line.
Confirm with 30-day CPU + memory metrics before shrinking.

---

## 4 · Findings & Prioritized Recommendations

Each finding lists: severity → recommended action → auto-fix vector.

| ID | Severity | Finding | Remediation | Auto-fix |
|---|---|---|---|---|
| **F-01** | High | Neither VM has Update Manager periodic assessment enabled | Set `patchSettings.assessmentMode = AutomaticByPlatform` on both | `scripts/azure-vm-remediate.sh` step 1 |
| **F-02** | High | Both VMs expose a direct public IPv4; NSGs not verified | Front with Azure Bastion **or** enable Just-in-Time VM access; deny 22/3389 from `Internet` | Bastion: manual; NSG rules: runbook step 6 |
| **F-03** | High | No backup posture visible in export | Provision a Recovery Services Vault per region and enable daily VM backup | Runbook step 4 |
| **F-04** | Medium | No monitoring agent visible; VM Insights not usable without AMA | Deploy `AzureMonitor{Linux,Windows}Agent` + a Data Collection Rule to a shared LAW | Runbook step 3 |
| **F-05** | Medium | Defender for Servers plan not confirmed | Enable **Defender for Servers Plan 2** on the subscription | Runbook step 7 |
| **F-06** | Medium | Cross-region footprint (India + US) with no clear reason | Consolidate on one region for latency/egress; or document why both are needed | Manual decision |
| **F-07** | Medium | No tags visible in export (Owner / Env / CostCenter) | Apply a mandatory tag set; block untagged writes via Azure Policy | Runbook step 2 + `scripts/policies/deny-untagged.json` |
| **F-08** | Low | `tiva-win11` is likely idle overnight but has no auto-shutdown | Enable DevTest Labs auto-shutdown (default 19:00 local + email notify) | Runbook step 5 |
| **F-09** | Low | 100 % PAYG pricing; no RI/Savings-Plan | Buy a 1-yr RI on the `-control-linux` VM (24×7 workload) | Manual purchase |
| **F-10** | Low | Inconsistent RG casing (`rg-…` vs `RG-…`) | Adopt lowercase-only convention; enforce with policy | Convention doc + policy |

---

## 5 · Cost Model

> **All figures are estimates.** Azure list prices vary by region, currency, Microsoft
> Customer Agreement discount, and promotional credits. The calculator link at the end
> of each row is the authoritative source.

Base rate assumptions (730-hour month, PAYG, list price):

| VM | Region | Approx PAYG rate | 730 h / month | Windows license | Total / month |
|---|---|---|---|---|---|
| `tiva-control-linux` D4as_v6 | Central India | ≈ US$ 0.19 / h | US$ 139 | — | **US$ 139** |
| `tiva-win11` D8ads_v6 | West US 2 | ≈ US$ 0.60 / h *(incl. Windows license)* | US$ 438 | included | **US$ 438** |
| | | | | **Compute subtotal** | **≈ US$ 577 / mo** |

Additional line items (not visible in the CSV but always present):

| Line | Estimate | Notes |
|---|---|---|
| Static Public IPs (×2) | ≈ US$ 7 / mo | US$ 3.65 each standard SKU |
| Premium SSD managed disks | ≈ US$ 20–60 / mo | Depends on disk size — CSV shows 1 + 3 disks |
| Egress (India → US or vice-versa) | Variable | Cross-region tax ≈ US$ 0.02–0.08 / GB |
| Backup (once enabled) | ≈ US$ 10–20 / mo | LRS vault, daily, 30-day retention |
| Defender for Servers P2 | US$ 15 / VM / mo | If enabled |
| Log Analytics ingestion | ≈ US$ 2.30 / GB | Depends on log volume; typical 1–3 GB / VM / mo |

**Realistic all-in with recommended controls on:** ≈ **US$ 650–720 / month** at PAYG.

### 5.1 Savings scenarios

| Scenario | Monthly | Annual | Savings vs PAYG |
|---|---|---|---|
| PAYG (today) | US$ 577 | US$ 6 924 | baseline |
| 1-yr Reserved on both VMs | ≈ US$ 375 | US$ 4 500 | **≈ 35 %** |
| 3-yr Reserved on both VMs | ≈ US$ 260 | US$ 3 115 | **≈ 55 %** |
| Auto-shutdown Win11 (12 h/day off) | ≈ US$ 358 | US$ 4 300 | ≈ 38 % of the Win11 line |
| AHB (bring-your-own Windows license) | ≈ US$ 485 | US$ 5 820 | ≈ 16 % overall |

**Combined “fastest-payback” recommendation:** 1-yr RI on `tiva-control-linux` + AHB +
auto-shutdown on `tiva-win11` → estimated **US$ 320 / month**, ≈ **44 %** off PAYG,
zero application changes required.

---

## 6 · Security Posture

| Control | Status | Evidence | Action |
|---|---|---|---|
| Public IP exposure | ❌ Both direct | CSV `PUBLIC IP ADDRESS` | F-02 — front with Bastion or enable JIT |
| NSG rules audit | ⚠️ Unknown from export | Not in CSV | Runbook step 6 dumps the rule set |
| Just-in-Time VM access | ❌ Not indicated | — | Enable via Defender for Cloud |
| Managed identities | ⚠️ Unknown from export | Not in CSV | Prefer system-assigned MI over stored creds |
| Disk encryption at rest | ✅ On by default | Platform-managed keys for all managed disks | Optionally upgrade to CMK / Encryption-at-Host |
| Boot diagnostics | ⚠️ Unknown | — | Runbook step 3 turns it on with managed storage |
| Defender for Cloud posture score | ⚠️ Unknown | — | Runbook step 7 enables **Defender for Servers P2** |
| Backup encryption | N/A yet | No vault visible | Runbook step 4 creates vaults + policy |
| MFA on subscription owners | Out of scope | — | Verify in Entra ID Conditional Access |

**Immediate hardening in 3 commands** (safe on both VMs today):

```bash
# 1. Snapshot before you touch anything
az snapshot create -g rg-tiva-master -n tiva-control-linux-snap-$(date +%F) \
  --source $(az vm show -g rg-tiva-master -n tiva-control-linux --query storageProfile.osDisk.managedDisk.id -o tsv)

# 2. Turn on Update Manager periodic assessment (Linux)
az vm update -g rg-tiva-master -n tiva-control-linux \
  --set osProfile.linuxConfiguration.patchSettings.assessmentMode=AutomaticByPlatform

# 3. Turn on Update Manager periodic assessment (Windows)
az vm update -g RG-TIVA-AZURE-RD -n tiva-win11 \
  --set osProfile.windowsConfiguration.patchSettings.assessmentMode=AutomaticByPlatform
```

---

## 7 · Governance & Compliance

| Check | Current | Target |
|---|---|---|
| Mandatory tags (`Owner`, `Environment`, `CostCenter`, `DataClassification`) | Not visible | Enforced via policy |
| Naming convention | `tiva-*` — consistent VM names, inconsistent RG casing | Regex-enforced |
| Region policy | Ad-hoc across 2 regions | Approved-region allowlist |
| Update rings | None | Ring-based rollout via Update Manager schedules |
| Diagnostic-settings-to-LAW | Unknown | 100 % of VMs stream to a central Log Analytics workspace |

**Three Azure Policy JSONs are provided** in `scripts/policies/`:

1. `deny-untagged.json` — deny any VM create/update without `Owner` and `Environment` tags.
2. `audit-missing-assessment.json` — audit VMs whose `patchSettings.assessmentMode`
   is not `AutomaticByPlatform`.
3. `deny-public-ip-on-nic.json` — deny attaching a public IP directly to a VM NIC
   (forces use of Bastion / Application Gateway / Front Door).

Assign these at the **subscription** scope after review.

---

## 8 · Auto-Remediation Runbook

The runbook lives at `scripts/azure-vm-remediate.sh`. It is:

- **Idempotent** — safe to run repeatedly; each step no-ops if state already matches.
- **Scoped by allowlist** — only touches the two VMs listed in `TARGETS`.
- **Dry-run first** — `DRY_RUN=1 ./scripts/azure-vm-remediate.sh` prints every command it
  would run, without executing.

Steps executed (in order):

1. Enable `AutomaticByPlatform` assessment mode on each VM (fixes **F-01**).
2. Apply the mandatory tag set to each VM (fixes **F-07**).
3. Enable boot diagnostics with a managed storage account **and** install
   Azure Monitor Agent (fixes **F-04**).
4. Create a per-region Recovery Services Vault + `DefaultPolicy` + enable VM backup
   (fixes **F-03**).
5. Configure auto-shutdown on `tiva-win11` at 19:00 IST with 30-min notification
   (fixes **F-08**).
6. Dump the current NSG rules for each VM's NIC and flag any `0.0.0.0/0` → 22/3389
   rule for human review (progress toward **F-02**).
7. Enable Defender for Servers Plan 2 on the subscription (fixes **F-05**).

**Prerequisites the runner needs:**

- `az` CLI ≥ 2.65 (`az --version`).
- Signed-in principal with `Contributor` on both RGs + `Security Admin` (for step 7).
- The `az extension add --name resource-graph` extension is not required.

**Human-decision items (deliberately not automated):**

- Region consolidation (**F-06**) — an app-owner decision.
- Reserved Instance purchase (**F-09**) — a finance-team decision.
- Bastion deployment (**F-02**) — requires a `/26` subnet in each VNet and a design choice.

---

## 9 · Appendix — Raw CSV row-by-row decode

**Row 1 — `tiva-control-linux`**

| Column | Value |
|---|---|
| NAME | tiva-control-linux |
| SUBSCRIPTION | Azure subscription 1 |
| RESOURCE GROUP | rg-tiva-master |
| LOCATION | Central India |
| STATUS | Running |
| OPERATING SYSTEM | Linux |
| SIZE | Standard_D4as_v6 |
| PUBLIC IP ADDRESS | 20.219.7.113 |
| DISKS | 1 |
| UPDATE STATUS *(decoded)* | Portal prompt: “Enable periodic assessment” — Update Manager assessment is **not** configured for this VM |

**Row 2 — `tiva-win11`**

| Column | Value |
|---|---|
| NAME | tiva-win11 |
| SUBSCRIPTION | Azure subscription 1 |
| RESOURCE GROUP | RG-TIVA-AZURE-RD |
| LOCATION | West US 2 |
| STATUS | Running |
| OPERATING SYSTEM | Windows |
| SIZE | Standard_D8ads_v6 |
| PUBLIC IP ADDRESS | 20.230.136.75 |
| DISKS | 3 |
| UPDATE STATUS *(decoded)* | Portal prompt: “Enable periodic assessment” — Update Manager assessment is **not** configured for this VM |

---

## 10 · Change log for this branch

Files this analysis adds to the repository on branch
`claude/vm-setup-analysis-report-Pc46h`:

- `docs/VM_SETUP_ANALYSIS.md` — this report
- `scripts/azure-vm-remediate.sh` — the auto-remediation runbook
- `scripts/policies/deny-untagged.json` — Azure Policy (deny)
- `scripts/policies/audit-missing-assessment.json` — Azure Policy (audit)
- `scripts/policies/deny-public-ip-on-nic.json` — Azure Policy (deny)

No changes are made to the SaaS-admin-template application code itself.
