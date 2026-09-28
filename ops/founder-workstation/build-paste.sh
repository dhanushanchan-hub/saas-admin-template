#!/usr/bin/env bash
# Builds the one-paste file for Azure Cloud Shell: the workstation creator with
# the desktop setup script embedded (gzip + base64).
# Usage: bash ops/founder-workstation/build-paste.sh [output file]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-paste-azure-workstation.txt}"
B64="$(gzip -9 -n -c "$HERE/tiva-desktop-setup.ps1" | base64 -w0)"
BUILT="$(mktemp)"
python3 - "$HERE/tiva-azure-workstation.py" "$BUILT" "$B64" <<'PY'
import sys
src, dst, b64 = sys.argv[1:4]
s = open(src).read()
assert s.count('"__DESKTOP_SETUP__"') == 1
open(dst, "w").write(s.replace('"__DESKTOP_SETUP__"', '"' + b64 + '"'))
PY
{ echo "cat > ~/tiva-azure-workstation.py <<'TIVA_WS_EOF'"; cat "$BUILT"; echo "TIVA_WS_EOF"; echo "python3 ~/tiva-azure-workstation.py"; } > "$OUT"
cp "$BUILT" "${OUT%.txt}.py"
rm -f "$BUILT"
echo "Built $OUT and ${OUT%.txt}.py"
