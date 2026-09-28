#!/usr/bin/env bash
# TIVA Vault: a private document vault for the founder, the family and every
# company (Paperless-ngx). It reads scans and photos (English, Hindi, Kannada),
# sorts documents by person, company and type, and tracks renewal dates.
#
# It only ADDS things: it doesn't change or remove anything already on this
# machine. Safe to run again. Run it with:  sudo bash tiva-vault-setup.sh
# Options: --no-tailscale  (use the vault only from this machine's own desktop)

if [ "$(id -u)" -ne 0 ]; then exec sudo bash "$0" "$@"; fi
set -uo pipefail

DIR=/opt/tiva-vault
USE_TAILSCALE=1
[ "${1:-}" = "--no-tailscale" ] && USE_TAILSCALE=0
OCR_LANGUAGE="${TIVA_OCR_LANGUAGE:-eng+hin+kan}"

say() { printf '\n==> %s\n' "$1"; }
die() { printf '\n!! %s\nNothing else was changed.\n' "$1"; exit 1; }

say "1/6 Checking this machine"
. /etc/os-release
echo "$PRETTY_NAME | $(uname -m) | $(nproc) cores | $(free -g | awk '/Mem/{print $2}') GB RAM | $(df -h / | awk 'NR==2{print $4}') free disk"
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; } || die "Couldn't install curl"
command -v python3 >/dev/null || { apt-get update -qq && apt-get install -y -qq python3; } || die "Couldn't install python3"

say "2/6 Docker (runs the vault)"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh || die "Docker didn't install"
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || die "Docker Compose is missing. Run: apt-get install -y docker-compose-plugin"
echo "$(docker --version)"

say "3/6 Tailscale (so only your devices can open the vault)"
TS_NAME=""; TS_IP=""
if [ "$USE_TAILSCALE" = 1 ]; then
  command -v tailscale >/dev/null || { curl -fsSL https://tailscale.com/install.sh | sh || die "Tailscale didn't install"; }
  if ! tailscale status >/dev/null 2>&1; then
    echo "This machine isn't on your Tailscale yet. Get a one-time key at login.tailscale.com/admin/settings/keys"
    read -rsp "Paste the Tailscale auth key (hidden): " TS_KEY; echo
    tailscale up --authkey="$TS_KEY" || die "Tailscale sign-in failed"
  fi
  TS_IP="$(tailscale ip -4 | head -1)"
  TS_NAME="$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
  echo "On Tailscale as $TS_NAME ($TS_IP)"
else
  echo "Skipped: the vault will open only on this machine."
fi

say "4/6 Vault settings in $DIR"
mkdir -p "$DIR/consume" "$DIR/export"
chown 1000:1000 "$DIR/consume" "$DIR/export"
if [ -f "$DIR/.env" ]; then
  echo "Keeping the existing settings (this is a re-run)."
  PORT="$(grep '^PORT=' "$DIR/.env" | cut -d= -f2)"
  # Installed earlier without Tailscale? Let the Tailscale address log in too.
  if [ -n "$TS_NAME" ] && ! grep -q "^CSRF_ORIGINS=.*$TS_NAME" "$DIR/.env"; then
    sed -i "s|^CSRF_ORIGINS=.*|&,http://$TS_NAME:$PORT,http://${TS_NAME%%.*}:$PORT,http://$TS_IP:$PORT|" "$DIR/.env"
    echo "Added your Tailscale address to the vault's allowed addresses."
  fi
else
  PORT=""
  port_free() {
    if command -v ss >/dev/null; then [ -z "$(ss -ltnH "( sport = :$1 )")" ]
    else ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; fi
  }
  for p in $(seq 8010 8099); do
    port_free "$p" && { PORT=$p; break; }
  done
  [ -n "$PORT" ] || die "No free port between 8010 and 8099"
  ORIGINS="http://127.0.0.1:$PORT,http://localhost:$PORT"
  [ -n "$TS_NAME" ] && ORIGINS="$ORIGINS,http://$TS_NAME:$PORT,http://${TS_NAME%%.*}:$PORT,http://$TS_IP:$PORT"
  umask 077
  cat > "$DIR/.env" <<EOF
PORT=$PORT
PAPERLESS_SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')
POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(24))')
CSRF_ORIGINS=$ORIGINS
OCR_LANGUAGE=$OCR_LANGUAGE
EOF
  umask 022
fi

cat > "$DIR/docker-compose.yml" <<'EOF'
# TIVA Vault (Paperless-ngx). Settings and secrets are in .env next to this file.
services:
  broker:
    image: redis:7
    restart: unless-stopped
    volumes: [redisdata:/data]
  db:
    image: postgres:16
    restart: unless-stopped
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: paperless
      POSTGRES_USER: paperless
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
  gotenberg:
    image: gotenberg/gotenberg:8
    restart: unless-stopped
    command: ["gotenberg", "--chromium-disable-javascript=true", "--chromium-allow-list=file:///tmp/.*"]
  tika:
    image: apache/tika:latest
    restart: unless-stopped
  webserver:
    image: paperlessngx/paperless-ngx:3.2.1
    restart: unless-stopped
    depends_on: [db, broker, gotenberg, tika]
    # Only this machine can reach it directly; your devices use Tailscale.
    ports: ["127.0.0.1:${PORT}:8000"]
    volumes:
      - data:/usr/src/paperless/data
      - media:/usr/src/paperless/media
      - ./export:/usr/src/paperless/export
      - ./consume:/usr/src/paperless/consume
    environment:
      # Listen on IPv4 inside the container; some machines have IPv6 turned off.
      PAPERLESS_BIND_ADDR: 0.0.0.0
      PAPERLESS_REDIS: redis://broker:6379
      PAPERLESS_DBHOST: db
      PAPERLESS_DBPASS: ${POSTGRES_PASSWORD}
      PAPERLESS_SECRET_KEY: ${PAPERLESS_SECRET_KEY}
      PAPERLESS_CSRF_TRUSTED_ORIGINS: ${CSRF_ORIGINS}
      PAPERLESS_TIME_ZONE: Asia/Kolkata
      PAPERLESS_OCR_LANGUAGE: ${OCR_LANGUAGE}
      PAPERLESS_OCR_LANGUAGES: hin kan
      PAPERLESS_TIKA_ENABLED: "true"
      PAPERLESS_TIKA_GOTENBERG_ENDPOINT: http://gotenberg:3000
      PAPERLESS_TIKA_ENDPOINT: http://tika:9998
      PAPERLESS_CONSUMER_RECURSIVE: "true"
      PAPERLESS_CONSUMER_SUBDIRS_AS_TAGS: "true"
      PAPERLESS_FILENAME_FORMAT: "{{ created_year }}/{{ document_type }}/{{ title }}"
volumes:
  data:
  media:
  pgdata:
  redisdata:
EOF

say "5/6 Starting the vault (the first start downloads it and takes several minutes)"
cd "$DIR" || die "Can't open $DIR"
docker compose up -d || die "The vault didn't start (see the message above)"
printf "Waiting for it to come up"
READY=""; FELL_BACK=""
for _ in $(seq 1 120); do
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/" || true)"
  if [ "$code" = "200" ] || [ "$code" = "401" ] || [ "$code" = "302" ]; then READY=1; break; fi
  # If the Hindi/Kannada reading packs couldn't be downloaded, the vault refuses
  # to start. Fall back to English so it runs; the packs can be added later.
  if [ -z "$FELL_BACK" ] && [[ "$(docker compose logs webserver 2>&1)" == *"is not installed"* ]]; then
    FELL_BACK=1
    sed -i 's/^OCR_LANGUAGE=.*/OCR_LANGUAGE=eng/' "$DIR/.env"
    printf '
   Hindi/Kannada reading packs could not be downloaded, so the vault reads English only for now.
'
    docker compose up -d webserver >/dev/null 2>&1
  fi
  printf "."; sleep 5
done
echo
[ -n "$READY" ] || die "The vault didn't come up in 10 minutes. Send me: docker compose -f $DIR/docker-compose.yml logs --tail 50 webserver"
echo "The vault is running."

say "6/6 Your login and the ready-made organisation"
if [ ! -f "$DIR/.organised" ]; then
  read -rp "Choose your vault user name [founder]: " ADMIN_USER; ADMIN_USER="${ADMIN_USER:-founder}"
  while true; do
    read -rsp "Choose your vault password (12+ characters): " ADMIN_PASS; echo
    read -rsp "Type it again: " ADMIN_PASS2; echo
    [ "$ADMIN_PASS" = "$ADMIN_PASS2" ] && [ "${#ADMIN_PASS}" -ge 12 ] && break
    echo "They didn't match or it's shorter than 12 characters. Try again."
  done
  docker compose exec -T --user paperless \
    -e DJANGO_SUPERUSER_USERNAME="$ADMIN_USER" -e DJANGO_SUPERUSER_PASSWORD="$ADMIN_PASS" \
    -e DJANGO_SUPERUSER_EMAIL="$ADMIN_USER@tiva.local" \
    webserver python3 manage.py createsuperuser --noinput >/dev/null 2>&1 \
    || echo "(A user with that name already exists; using it.)"

  VAULT_URL="http://127.0.0.1:$PORT" VAULT_USER="$ADMIN_USER" VAULT_PASS="$ADMIN_PASS" python3 - <<'PYEOF' || die "Setting up the organisation failed (see above)"
import base64, json, os, urllib.request

URL, USER, PASS = os.environ["VAULT_URL"], os.environ["VAULT_USER"], os.environ["VAULT_PASS"]
AUTH = "Basic " + base64.b64encode(f"{USER}:{PASS}".encode()).decode()
ANY, LITERAL, REGEX, AUTO = 1, 3, 4, 6


def api(method, path, body=None):
    request = urllib.request.Request(
        URL + path, method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={"Authorization": AUTH, "Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response) if response.status != 204 else None


def existing(path):
    return {item["name"]: item for item in api("GET", f"{path}?page_size=1000")["results"]}


def ensure(path, items):
    have = existing(path)
    ids = {}
    for item in items:
        ids[item["name"]] = have[item["name"]]["id"] if item["name"] in have else api("POST", path, item)["id"]
    return ids


def rx(pattern):
    return {"match": pattern, "matching_algorithm": REGEX, "is_insensitive": True}


tags = ensure("/api/tags/", [
    {"name": "Inbox: to review", "color": "#e11d48", "is_inbox_tag": True, "matching_algorithm": 0},
    # People. Paperless learns to recognise them from the documents you tag.
    {"name": "Founder - Dhanush", "color": "#2563eb", "matching_algorithm": AUTO},
    {"name": "Father - Ganesh", "color": "#2563eb", "matching_algorithm": AUTO},
    {"name": "Mother", "color": "#2563eb", "matching_algorithm": AUTO},
    {"name": "Brother", "color": "#2563eb", "matching_algorithm": AUTO},
    {"name": "Grandmother", "color": "#2563eb", "matching_algorithm": AUTO},
    # Companies. Found by name in the document text.
    {"name": "Tiva World Foundation", "color": "#16a34a", **rx(r"tiva\s+(world\s+)?foundation")},
    {"name": "Tiva Beverages Pvt Ltd", "color": "#16a34a", **rx(r"tiva\s+beverages")},
    {"name": "TIVA Enterprises", "color": "#16a34a", **rx(r"tiva\s+enterprises?")},
    {"name": "TIVA Technology", "color": "#16a34a", **rx(r"tiva\s+tech(nology|nologies)?")},
])

types = ensure("/api/document_types/", [
    {"name": "Birth certificate", **rx(r"birth\s+certificate|certificate\s+of\s+birth")},
    {"name": "Aadhaar", **rx(r"aadhaa?r|unique\s+identification\s+authority")},
    {"name": "PAN card", **rx(r"permanent\s+account\s+number")},
    {"name": "Passport", **rx(r"passport\s+no|republic\s+of\s+india.{0,40}passport")},
    {"name": "Driving licence", **rx(r"driving\s+licen[cs]e")},
    {"name": "Voter ID", **rx(r"election\s+commission\s+of\s+india|elector'?s?\s+photo")},
    {"name": "Education certificate", **rx(r"marks\s*card|mark\s*sheet|degree\s+certificate|university|pre-?university")},
    {"name": "Property / land", **rx(r"sale\s+deed|khata|\brtc\b|encumbrance|land\s+records|property\s+tax")},
    {"name": "Vehicle", **rx(r"registration\s+certificate|chassis\s+no|engine\s+no")},
    {"name": "Insurance policy", **rx(r"insurance|policy\s+(no|number)|premium")},
    {"name": "Bank account / statement", **rx(r"statement\s+of\s+account|account\s+statement|ifsc|passbook")},
    {"name": "Loan", **rx(r"loan\s+(account|agreement|sanction)|\bemi\b")},
    {"name": "Income tax return", **rx(r"income\s+tax\s+return|\bitr-?\s?\d|acknowledgement\s+number")},
    {"name": "GST", **rx(r"gstin|goods\s+and\s+services\s+tax|gstr-?\s?\d")},
    {"name": "Company registration (MCA)", **rx(r"certificate\s+of\s+incorporation|ministry\s+of\s+corporate\s+affairs|corporate\s+identity\s+number")},
    {"name": "MOA / AOA", **rx(r"memorandum\s+of\s+association|articles\s+of\s+association")},
    {"name": "NGO Darpan", **rx(r"ngo\s*darpan|\bdarpan\b|niti\s+aayog")},
    {"name": "12A / 80G / CSR-1", **rx(r"\b12\s?ab?\b|\b80\s?g\b|csr-?\s?1")},
    {"name": "FSSAI licence", **rx(r"fssai|food\s+safety\s+and\s+standards")},
    {"name": "Udyam / MSME", **rx(r"udyam|\bmsme\b")},
    {"name": "DPIIT / Startup India", **rx(r"dpiit|startup\s+india")},
    {"name": "Trade licence / permit", **rx(r"trade\s+licen[cs]e")},
    {"name": "Board resolution / minutes", **rx(r"board\s+resolution|minutes\s+of\s+(the\s+)?meeting")},
    {"name": "Agreement / contract", **rx(r"agreement|memorandum\s+of\s+understanding|\bmou\b")},
    {"name": "Invoice / bill", **rx(r"tax\s+invoice|invoice\s+no|bill\s+no")},
    {"name": "Medical", **rx(r"hospital|prescription|diagnosis")},
    {"name": "Utility bill", **rx(r"mescom|bescom|electricity\s+bill|water\s+bill|broadband")},
    {"name": "Other", "matching_algorithm": 0},
])

fields = ensure("/api/custom_fields/", [
    {"name": "Renewal / expiry date", "data_type": "date"},
    {"name": "Document number", "data_type": "string"},
    {"name": "Issued by", "data_type": "string"},
    {"name": "Amount", "data_type": "monetary", "extra_data": {"default_currency": "INR"}},
])

expiry = fields["Renewal / expiry date"]
views = ensure("/api/saved_views/", [
    {"name": "Renewals coming up", "sort_field": f"custom_field_{expiry}", "sort_reverse": False,
     "filter_rules": [{"rule_type": 39, "value": str(expiry)}]},
    {"name": "To review", "sort_field": "added", "sort_reverse": True,
     "filter_rules": [{"rule_type": 6, "value": str(tags["Inbox: to review"])}]},
    *[{"name": name, "sort_field": "created", "sort_reverse": True,
       "filter_rules": [{"rule_type": 6, "value": str(tags[name])}]}
      for name in ["Tiva World Foundation", "Tiva Beverages Pvt Ltd", "TIVA Enterprises", "TIVA Technology",
                   "Founder - Dhanush", "Father - Ganesh", "Mother", "Brother", "Grandmother"]],
])

settings = (api("GET", "/api/ui_settings/") or {}).get("settings") or {}
settings.setdefault("saved_views", {})
settings["saved_views"]["dashboard_views_visible_ids"] = [views["Renewals coming up"], views["To review"]]
settings["saved_views"]["sidebar_views_visible_ids"] = list(views.values())
api("POST", "/api/ui_settings/", {"settings": settings})
print(f"Ready-made: {len(tags)} tags (people and companies), {len(types)} document types, "
      f"{len(fields)} fields including renewal date, {len(views)} saved views.")
PYEOF
  touch "$DIR/.organised"
else
  echo "Already organised on an earlier run."
fi

# Nightly backup copy at 2 AM India time (20:30 UTC) into $DIR/export.
cat > /etc/cron.d/tiva-vault-backup <<EOF
30 20 * * * root cd $DIR && docker compose exec -T --user paperless webserver document_exporter ../export --delete >/dev/null 2>&1
EOF

ADDRESS="http://127.0.0.1:$PORT"
if [ -n "$TS_NAME" ]; then
  tailscale serve --bg --http="$PORT" "http://127.0.0.1:$PORT" >/dev/null 2>&1 \
    && ADDRESS="http://${TS_NAME%%.*}:$PORT  (or http://$TS_IP:$PORT)" \
    || echo "Tailscale sharing didn't start; the vault works on this machine at http://127.0.0.1:$PORT"
fi

printf '\n================ TIVA VAULT READY ================\n'
echo "Open it:        $ADDRESS"
echo "On this machine: http://127.0.0.1:$PORT"
echo "Bulk upload:    drag files onto the web page, or copy whole folders into $DIR/consume"
echo "                (folder names become tags, e.g. consume/Tiva Beverages Pvt Ltd/GST/)"
echo "Backups:        every night at 2 AM into $DIR/export"
echo "Nothing already on this machine was changed."
