# TIVA self-hosted tools

Eight open-source tools, one Docker stack, for the Founder's workstation or VM
(the Azure/Oracle box in [`../founder-workstation`](../founder-workstation) — or any
machine with Docker). These are full server apps with their own databases, so
they run on a Docker host, **not** on Cloudflare Workers.

| Tool | What it's for | Default URL |
| --- | --- | --- |
| Excalidraw | Whiteboard / diagrams | http://HOST:5001 |
| Memos | Quick notes, a private micro-journal | http://HOST:5002 |
| NocoDB | Airtable-style database on your data | http://HOST:5003 |
| PocketBase | Instant backend (DB, auth, files) | http://HOST:5004 |
| Appsmith | Build internal tools and admin panels | http://HOST:5005 |
| Hoppscotch | Test and design APIs | http://HOST:5006 (admin :5007) |
| Docmost | Team wiki and documents | http://HOST:5009 |
| DeerFlow | Deep-research SuperAgent | http://HOST:2026 (its own repo, see below) |

`HOST` is the machine's address — over Tailscale, its Tailscale IP or MagicDNS name.

## Start it

```bash
cd ops/self-hosted
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD and the other secrets (openssl rand -hex 32).
docker compose up -d
```

That's it — each tool is on its port above. Check status with `docker compose ps`
and logs with `docker compose logs -f <service>`.

Two tools have a first-run setup:

- **PocketBase**: open http://HOST:5004/_/ and create the admin account.
- **Hoppscotch, Docmost**: they migrate their database on first start. Give them
  a minute, then open the URL and create the first account. Hoppscotch has more
  optional settings (SSO, SMTP) — see its docs if you want them.

## Nice hostnames and HTTPS (optional)

The ports work everywhere with zero setup. If you'd rather use names like
`memos.tools.yourdomain.com` with automatic HTTPS, set `TIVA_DOMAIN` in `.env`,
point `*.that-domain` at the host, and run:

```bash
docker compose --profile proxy up -d
```

## DeerFlow

DeerFlow (ByteDance) ships its own multi-service compose and needs its own LLM
keys, so it's run from its repo rather than pinned here:

```bash
git clone https://github.com/bytedance/deer-flow.git
cd deer-flow && make config   # fill in config.yaml / .env with your model keys
make docker-init && make docker-start   # serves on http://HOST:2026
```

Once it's up, the optional Caddy proxy above can route a `deerflow.` hostname to it.

## Notes

- **Back up the volumes.** All data lives in the named Docker volumes
  (`docker volume ls | grep tiva-tools`). Back these up, or point them at a disk
  you snapshot.
- **Keep it private.** Don't open these ports to the public internet. Reach them
  over Tailscale, or put the Caddy proxy behind Cloudflare Access.
- **Versions.** Images use current tags; pin them to exact versions in
  `docker-compose.yml` when you want fully repeatable rebuilds.
- **Update:** `docker compose pull && docker compose up -d`.
