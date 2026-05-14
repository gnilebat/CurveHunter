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
| Domain | `schraeglage-maps.de` — Namecheap | €5.97 / year (paid) |
| Server | **Contabo Cloud VPS 20** — 6 vCPU, 12 GB RAM, 100 GB NVMe, EU | ~€8–11 / month (12-month prepay) |
| TLS certificate | Let's Encrypt via Caddy | free |
| **Total** | | **~€9–12 / month** |

**Sizing:** the full Germany stack was measured warmed (10 cross-country
routes + searches): GraphHopper ~5.9 GB (`-Xmx6g` cap), Photon ~0.6 GB,
backend + nginx + postgres + Caddy ~0.2 GB, + OS ≈ **~7–8 GB total**. VPS 20's
12 GB leaves a comfortable ~4 GB for OS page cache (the memory-mapped Photon
index, PMTiles) and traffic burst. 8 GB would be too tight; 12 GB is the spot.

**Testing for free first:** Oracle Cloud Always Free gives an ARM box (up to
4 cores / 24 GB RAM) **free forever** — it runs this stack comfortably. See
the alternative in §4; recommended before committing to the paid Contabo box.

---

## 3. Domain

`schraeglage-maps.de` is already registered at **Namecheap** — nothing to buy.
You'll point its DNS at the server in step 9, once the server exists and you
have its IP.

(Optional: you could move DNS hosting to Cloudflare's free plan for a nicer
panel and optional proxy/DDoS shielding later. Not required — Caddy gets the
TLS cert straight from Let's Encrypt either way. The steps below assume DNS
stays at Namecheap.)

---

## 4. Provision the Contabo server

1. Order a **Cloud VPS 20** at <https://contabo.com> (6 vCPU, 12 GB RAM,
   100 GB NVMe).
2. Settings:
   - **Region:** EU / Germany (Nuremberg) — low latency for German users
   - **Image:** Ubuntu 24.04
   - **Login:** add your SSH public key (`~/.ssh/id_ed25519.pub`) if Contabo
     offers it; otherwise you'll get a root password and switch to key auth
     in step 5
   - **Period:** the cheap price needs a 12-month prepay — pick the term you want
3. Provisioning can take minutes to a few hours (Contabo runs a manual fraud
   check on new accounts). You'll receive the **IPv4 address** + root
   credentials by email.

---

## 5. First-boot server hardening

SSH in as root — `ssh root@<server-ip>` (use the emailed password if you
weren't able to add an SSH key at order time).

> **If you only have a root password:** first get your key onto the box from
> your local machine — `ssh-copy-id root@<server-ip>` — then continue below.
> The steps after this disable password login entirely.
>
> **On Oracle Cloud** you log in as `ubuntu`, not `root` —
> `ssh ubuntu@<server-ip>`. That user already has key auth + passwordless
> sudo, so **skip the "Non-root deploy user" block** below and keep using
> `ubuntu` — substitute `ubuntu` for `deploy` everywhere else in this guide.

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

Download PMTiles + OSM PBF straight onto the server with `wget` (inbound
traffic is free on Contabo). The Photon index you build on your machine and
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
- `DOMAIN` — `schraeglage-maps.de`
- `ACME_EMAIL` — your email (Let's Encrypt expiry notices)

---

## 9. Point DNS at the server

In the **Namecheap** dashboard:

1. **Domain List → Manage** (next to `schraeglage-maps.de`) → **Advanced DNS** tab.
2. Under **Host Records**, delete the default parking/redirect records, then
   **Add New Record**:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | A Record | `@` | `<server-ip>` | Automatic |

3. (Optional) add a second `A Record`, Host `www` → same IP, so
   `www.schraeglage-maps.de` resolves too.
4. Save. Propagation is usually minutes — check with
   `dig +short schraeglage-maps.de` → it should print your server IP.

**Caddy can't get a TLS certificate until DNS resolves**, so wait for that
before the first deploy.

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

> **On 12 GB, the first GraphHopper import can be tight** if everything starts
> at once. If GraphHopper gets OOM-killed mid-import, bring it up alone first,
> let it finish, then start the rest:
> ```bash
> docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d graphhopper
> # wait for "healthy": docker compose ps
> docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile geocoder up -d --build
> ```
> Once the graph cache is built, normal startup uses far less memory.

---

## 11. Verify

```bash
# from anywhere
curl -I https://schraeglage-maps.de            # 200, valid cert
curl 'https://schraeglage-maps.de/api/search?q=Berlin'   # geocoder
```

Then in a browser:
- App loads over HTTPS, map tiles render, search autocompletes, a route
  calculates.
- **PWA:** Chrome/Edge show an install prompt (or ⋮ → Install app). On the
  installed app, the icon should be the Schräglage logo (the PNG icons in
  the manifest). iOS: Share → Add to Home Screen.
- DevTools → Application → Service Workers shows `sw.js` activated.

Share `https://schraeglage-maps.de` with friends — done.

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
re-downloadable or re-buildable. A whole-server snapshot once it's set up is
the simplest insurance — Contabo offers **Auto Backup** as a cheap add-on, or
take a manual snapshot from the control panel before big changes.

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
