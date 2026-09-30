#!/usr/bin/env bash
# Azure VM auto-remediation runbook
# Applies every safe fix from docs/VM_SETUP_ANALYSIS.md, idempotently.
#
# Usage:
#   DRY_RUN=1 ./scripts/azure-vm-remediate.sh   # print commands only
#   ./scripts/azure-vm-remediate.sh              # apply
#
# Prereqs:
#   - az CLI >= 2.65 signed in with Contributor on the two RGs
#   - Security Admin for step 7 (Defender for Servers)

set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-e648ece2-9bbe-4ff5-80b3-fa03d39bbe20}"
DRY_RUN="${DRY_RUN:-0}"

# rg:name:location:os
TARGETS=(
  "rg-tiva-master:tiva-control-linux:centralindia:linux"
  "RG-TIVA-AZURE-RD:tiva-win11:westus2:windows"
)

TAGS=(
  "Owner=tiva-ops"
  "Environment=production"
  "CostCenter=platform"
  "DataClassification=internal"
  "ManagedBy=azure-vm-remediate.sh"
)

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
run()  {
  if [[ "$DRY_RUN" == "1" ]]; then
    printf '  [dry-run] %s\n' "$*"
  else
    eval "$@"
  fi
}

log "Selecting subscription $SUBSCRIPTION"
run "az account set --subscription '$SUBSCRIPTION'"

# ---------------------------------------------------------------------------
# Step 1 — F-01: enable Update Manager periodic assessment on every VM
# ---------------------------------------------------------------------------
log "Step 1 · Enable AutomaticByPlatform patch assessment"
for row in "${TARGETS[@]}"; do
  IFS=':' read -r RG NAME LOC OS <<< "$row"
  if [[ "$OS" == "linux" ]]; then
    run "az vm update -g '$RG' -n '$NAME' \
      --set osProfile.linuxConfiguration.patchSettings.assessmentMode=AutomaticByPlatform \
      -o none"
  else
    run "az vm update -g '$RG' -n '$NAME' \
      --set osProfile.windowsConfiguration.patchSettings.assessmentMode=AutomaticByPlatform \
      --set osProfile.windowsConfiguration.patchSettings.patchMode=AutomaticByPlatform \
      -o none"
  fi
done

# ---------------------------------------------------------------------------
# Step 2 — F-07: apply mandatory tag set
# ---------------------------------------------------------------------------
log "Step 2 · Apply mandatory tags"
for row in "${TARGETS[@]}"; do
  IFS=':' read -r RG NAME LOC OS <<< "$row"
  run "az resource tag \
    --resource-group '$RG' --name '$NAME' \
    --resource-type Microsoft.Compute/virtualMachines \
    --tags ${TAGS[*]} \
    --is-incremental -o none"
done

# ---------------------------------------------------------------------------
# Step 3 — F-04: boot diagnostics + Azure Monitor Agent
# ---------------------------------------------------------------------------
log "Step 3 · Boot diagnostics + Azure Monitor Agent"
for row in "${TARGETS[@]}"; do
  IFS=':' read -r RG NAME LOC OS <<< "$row"
  run "az vm boot-diagnostics enable -g '$RG' -n '$NAME' -o none"
  if [[ "$OS" == "linux" ]]; then
    EXT="AzureMonitorLinuxAgent"
  else
    EXT="AzureMonitorWindowsAgent"
  fi
  run "az vm extension set \
    --resource-group '$RG' --vm-name '$NAME' \
    --name '$EXT' --publisher Microsoft.Azure.Monitor \
    --enable-auto-upgrade true -o none"
done

# ---------------------------------------------------------------------------
# Step 4 — F-03: Recovery Services Vault per region + daily VM backup
# ---------------------------------------------------------------------------
log "Step 4 · Recovery Services Vaults + backup"
declare -A REGION_VAULT_RG=(
  ["centralindia"]="rg-tiva-backup-centralindia"
  ["westus2"]="rg-tiva-backup-westus2"
)
declare -A REGION_VAULT=(
  ["centralindia"]="rsv-tiva-centralindia"
  ["westus2"]="rsv-tiva-westus2"
)
for LOC in "${!REGION_VAULT[@]}"; do
  RG="${REGION_VAULT_RG[$LOC]}"
  VAULT="${REGION_VAULT[$LOC]}"
  run "az group create -n '$RG' -l '$LOC' -o none"
  run "az backup vault create -g '$RG' -n '$VAULT' -l '$LOC' -o none"
done
for row in "${TARGETS[@]}"; do
  IFS=':' read -r RG NAME LOC OS <<< "$row"
  BRG="${REGION_VAULT_RG[$LOC]}"
  VAULT="${REGION_VAULT[$LOC]}"
  VM_ID="$(az vm show -g "$RG" -n "$NAME" --query id -o tsv 2>/dev/null || echo '<VM_ID>')"
  run "az backup protection enable-for-vm \
    --resource-group '$BRG' --vault-name '$VAULT' \
    --vm '$VM_ID' --policy-name DefaultPolicy -o none"
done

# ---------------------------------------------------------------------------
# Step 5 — F-08: auto-shutdown on the Windows workstation
# ---------------------------------------------------------------------------
log "Step 5 · Auto-shutdown on tiva-win11 at 19:00 IST"
VM_ID_WIN="$(az vm show -g RG-TIVA-AZURE-RD -n tiva-win11 --query id -o tsv 2>/dev/null || echo '<VM_ID>')"
run "az resource create \
  --resource-type Microsoft.DevTestLab/schedules \
  --name shutdown-computevm-tiva-win11 \
  --resource-group RG-TIVA-AZURE-RD \
  --location westus2 \
  --properties '{
    \"status\":\"Enabled\",
    \"taskType\":\"ComputeVmShutdownTask\",
    \"dailyRecurrence\":{\"time\":\"1900\"},
    \"timeZoneId\":\"India Standard Time\",
    \"notificationSettings\":{\"status\":\"Enabled\",\"timeInMinutes\":30},
    \"targetResourceId\":\"'$VM_ID_WIN'\"
  }' -o none"

# ---------------------------------------------------------------------------
# Step 6 — F-02: dump NSG rules for human review
# ---------------------------------------------------------------------------
log "Step 6 · Audit NSG rules on each VM's NIC"
for row in "${TARGETS[@]}"; do
  IFS=':' read -r RG NAME LOC OS <<< "$row"
  NIC_ID="$(az vm show -g "$RG" -n "$NAME" --query 'networkProfile.networkInterfaces[0].id' -o tsv 2>/dev/null || echo '')"
  if [[ -z "$NIC_ID" ]]; then continue; fi
  NSG_ID="$(az resource show --ids "$NIC_ID" --query 'properties.networkSecurityGroup.id' -o tsv 2>/dev/null || echo '')"
  if [[ -n "$NSG_ID" ]]; then
    echo "  NSG for $NAME: $NSG_ID"
    run "az network nsg rule list --ids '$NSG_ID' -o table"
  else
    echo "  $NAME NIC has no NSG attached — subnet NSG is authoritative."
  fi
done

# ---------------------------------------------------------------------------
# Step 7 — F-05: Defender for Servers Plan 2 on the subscription
# ---------------------------------------------------------------------------
log "Step 7 · Enable Defender for Servers Plan 2"
run "az security pricing create -n VirtualMachines --tier Standard --subplan P2 -o none"

log "Done. Re-run any time — every step is idempotent."
