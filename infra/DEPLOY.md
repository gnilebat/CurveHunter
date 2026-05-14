# Deploying Schräglage

End-to-end plan to put the app online for you and your friends: domain →
server → data → deploy → HTTPS → verify. Germany-only data throughout.

---

## 1. What you're deploying

```
                Internet
                   │  443 (HTTPS)
              ┌────▼─────┐
              │  Caddy   │  public entrypoint, automatic Let's Encrypt TLS
              └────┬─────┘
                   │ :80 (internal)
              ┌────▼─────┐
              │  nginx   │  serves frontend, /tiles PMTiles, proxies /api
              └────┬─────┘
        ┌──────────┼───────────────┐
   ┌────▼────┐ ┌───▼──────┐ ┌──────▼─────┐
   │ backend │ │graphhopper│ │   photon   │
   │ FastAPI │ │  routing  │ │  geocoder  │
   └────┬────┘ └───────────┘ └────────────┘
   ┌────▼─────┐
   │ postgres │  PostGIS
   └──────────┘
```

All services run as containers via Docker Compose. Caddy + the prod overrides
come from `docker-compose.prod.yml`.

---

## 2. Costs

| Item | Choice | Cost |
|---|---|---|
| Domain | any registrar (Namecheap, Porkbun, INWX, Cloudflare Registrar) | ~€8–12 / year |
| Server | **Hetzner Cloud CX42** — 8 vCPU, 16 GB RAM, 160 GB SSD | ~€13.49 / month |
| TLS certificate | Let's Encrypt via Caddy | free |
| **Total** | | **~€14 / month** |

A CX32 (8 GB) also works but is tight — see the GraphHopper note in
`docker-compose.prod.yml`. For friends-scale testing, CX42 is the comfortable
pick.

---

## 3. Get a domain

1. Buy a domain at any registrar. A short `.de` or `.app` is fine. Example
   used below: `schraeglage.example.com` (use your real one).
2. You'll point a DNS **A record** at the server's IP in step 9 — don't do it
   yet, you need the IP first.
3. (Optional but recommended) Move DNS to **Cloudflare** (free plan): faster
   DNS, easy record management, optional proxy/DDoS shielding later. Not
   required — Caddy gets the cert directly from Let's Encrypt either way.

---

## 4. Provision the Hetzner server

1. Create a Hetzner Cloud account → new project → **Add Server**.
2. Settings:
   - **Location:** Falkenstein or Nuremberg (low latency to German users)
   - **Image:** Ubuntu 24.04
   - **Type:** CX42
   - **SSH key:** add your public key (`~/.ssh/id_ed25519.pub`) — do *not*
     use password auth
   - **Name:** `schraeglage`
3. Create it. Note the public **IPv4 address**.

---

## 5. First-boot server hardening

SSH in as root: `ssh root@<server-ip>`

```bash
# Patch
apt update && apt upgrade -y

# Non-root deploy user
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh && chmod 600 /home/deploy/.ssh/authorized_keys

# Lock down SSH: no root login, no passwords
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# Firewall — only SSH + HTTP + HTTPS
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

From now on connect as `ssh deploy@<server-ip>`.

---

## 6. Install Docker

As `deploy`:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy
# log out and back in so the group applies
exit
```

Reconnect, verify: `docker compose version`.

---

## 7. Get the code and data onto the server

### 7a. Clone the repo

```bash
sudo mkdir -p /opt/curvehunter && sudo chown deploy:deploy /opt/curvehunter
git clone <your-repo-url> /opt/curvehunter
cd /opt/curvehunter/infra
```

### 7b. Big data files — download these yourself

| File | Put it at | Source | Size |
|---|---|---|---|
| Germany PMTiles | `infra/tiles/map.pmtiles` | build at <https://maps.protomaps.com/builds/> (cut a Germany bbox) | ~3 GB |
| Germany OSM PBF (for GraphHopper) | `infra/data/osm/map.osm.pbf` | <https://download.geofabrik.de/europe/germany-latest.osm.pbf> | ~4.5 GB |
| Photon index | `infra/photon-index/` | **built locally** — see `GEOCODER.md` | ~6–8 GB |

Download PMTiles + OSM PBF straight onto the server with `wget` (Hetzner
ingress is free and fast). The Photon index you build on your machine and
push with `scripts/push-geocoder.sh` (step 10).

```bash
# on the server
cd /opt/curvehunter/infra
wget -O data/osm/map.osm.pbf https://download.geofabrik.de/europe/germany-latest.osm.pbf
# PMTiles: download your Germany build to tiles/map.pmtiles
```

> The OSM PBF for GraphHopper is the same Geofabrik extract you already
> downloaded for the Photon import — if it's handy you can `scp` it up
> instead of re-downloading.

---

## 8. Configure environment

```bash
cd /opt/curvehunter/infra
cp .env.example .env
nano .env
```

Set:
- `POSTGRES_PASSWORD` — a long random string
- `DOMAIN` — your real domain (e.g. `schraeglage.example.com`)
- `ACME_EMAIL` — your email (Let's Encrypt expiry notices)

---

## 9. Point DNS at the server

At your DNS provider, create:

| Type | Name | Value |
|---|---|---|
| A | `schraeglage` (or `@`) | `<server-ip>` |

Wait for it to resolve (`dig +short schraeglage.example.com` → your IP).
**Caddy can't get a TLS certificate until DNS resolves**, so do this before
the first deploy. If you use Cloudflare, set the record to **DNS-only (grey
cloud)** for the first deploy so Caddy's HTTP challenge works; you can switch
it to proxied afterwards.

---

## 10. First deploy

### 10a. Build the frontend

The frontend `dist/` is bind-mounted into nginx, so it has to exist on the
server. Build it there:

```bash
# install Node 20 once
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

cd /opt/curvehunter/frontend
npm ci
npm run build
```

### 10b. Push the Photon index from your machine

On **your local machine**, after building the index (`GEOCODER.md`):

```bash
cd infra
GEOCODER_SERVER=deploy@<server-ip> ./scripts/push-geocoder.sh
```

(First run: the script also restarts the photon container — that's fine even
if the rest of the stack isn't up yet, it'll just error harmlessly. Or run it
again after 10c.)

### 10c. Bring the stack up

On the **server**:

```bash
cd /opt/curvehunter/infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               --profile geocoder up -d --build
```

First start is slow: GraphHopper imports the OSM graph (~5–10 min, watch
`docker compose logs -f graphhopper`). Caddy fetches the TLS cert within
seconds once DNS resolves.

---

## 11. Verify

```bash
# from anywhere
curl -I https://schraeglage.example.com            # 200, valid cert
curl 'https://schraeglage.example.com/api/search?q=Berlin'   # geocoder
```

Then in a browser:
- App loads over HTTPS, map tiles render, search autocompletes, a route
  calculates.
- **PWA:** Chrome/Edge show an install prompt (or ⋮ → Install app). On the
  installed app, the icon should be the Schräglage logo (the PNG icons in
  the manifest). iOS: Share → Add to Home Screen.
- DevTools → Application → Service Workers shows `sw.js` activated.

Share `https://schraeglage.example.com` with friends — done.

---

## 12. Updating the app

Code changes:

```bash
cd /opt/curvehunter
git pull
cd frontend && npm ci && npm run build && cd ../infra
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               --profile geocoder up -d --build
```

Fresh geocoder data: rebuild the index locally (`GEOCODER.md`) and re-run
`scripts/push-geocoder.sh`.

Fresh map/routing data: replace `infra/tiles/map.pmtiles` and
`infra/data/osm/map.osm.pbf`, then for GraphHopper to re-import you must clear
its graph cache:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker volume rm infra_graphhopper-cache
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
               --profile geocoder up -d --build
```

OS patches: `sudo apt update && sudo apt upgrade -y` periodically; reboot if a
kernel update lands.

---

## 13. Backups

The only state worth backing up is small:
- `infra/.env` — keep a copy somewhere safe (it's gitignored)
- `postgres-data` volume — only matters once the curvature ETL has populated
  it; until then there's nothing to lose

Everything else (PMTiles, OSM PBF, Photon index, GraphHopper graph) is
re-downloadable or re-buildable. A Hetzner snapshot (~€0.01/GB/month) of the
whole server once it's set up is the simplest insurance.

---

## 14. Troubleshooting

| Symptom | Check |
|---|---|
| Caddy won't get a cert | DNS not resolving yet, or Cloudflare proxy on during first issue. `docker compose logs caddy`. |
| 502 from nginx | a backend service is still starting — `docker compose ps`, `logs graphhopper` |
| GraphHopper keeps restarting | out of memory — lower `JAVA_OPTS -Xmx` in `docker-compose.prod.yml` |
| Autocomplete returns nothing | `photon-index/` missing or not pushed — `docker compose logs photon`; re-run `push-geocoder.sh` |
| Tiles blank | `infra/tiles/map.pmtiles` missing or wrong region |
| PWA won't install | must be real HTTPS (it is, via Caddy) — hard-refresh, check the manifest in DevTools |

Logs for everything: `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f <service>`
