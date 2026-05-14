# Schräglage Maps

Self-hosted motorcycle route planner that scores roads by curviness and lets riders find — or generate — fun, twisty routes instead of the fastest line. Built around an open-source stack with no third-party APIs; everything runs on your own infrastructure.

Live at **[schraeglage-maps.de](https://schraeglage-maps.de)**. The on-disk repo folder is still `CurveHunter/` from the original prototype; only the user-facing brand changed.

---

## Highlights

- **Curvy routing** — a custom GraphHopper profile (`motorcycle_curvy`) plus a tunable custom model. Each route is scored live in the backend (Σ |Δbearing| / km) and rendered with a green → yellow → red gradient on the map.
- **Round-trip loops** — pick a start + a distance (10–300 km) and get a closed loop back. Shuffle button for alternate seeds.
- **Up to 3 alternative routes** per request — render under the active route, click to swap.
- **N-waypoint planning** — drag pins on the map, drag the route line itself to insert a via, draggable markers, +/× to add or remove vias.
- **Turn-by-turn navigation** with live position, ETA, off-route detection, recentre floating button.
- **Voice cues** at 500 / 200 / 50 m + arrival + off-route — built on Web Speech (Piper engine stub in place).
- **GPX import + export** — drop a `.gpx` to load waypoints, download the current route as GPX 1.1 with track + elevation.
- **Save** custom presets, named routes, named places (all in `localStorage`; no account needed).
- **Elevation profile chart** under the route stats (SVG from the 3rd geometry ordinate).
- **Speed-limit badge** during nav — pulses when GPS speed exceeds the tagged limit by > 5 km/h.
- **Bottom-sheet mobile UI** with a drag handle to expand/collapse; map pans up until it covers 50 % of the screen then locks.
- **Light + dark themes**, German + English (German is the source of truth).
- **PWA** — installable (manifest + PNG icons + service worker), theme color, wake-lock during nav, in-UI "voice may pause when screen locks" warning, offline app-shell cache.
- **Route preview** — toggle a simulator in the nav view (robot-head button next to mute) to play your position along the route and preview the turns before riding.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full feature list, status, and backlog.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast DX, large ecosystem |
| Map rendering | MapLibre GL JS | MIT-licensed, reads PMTiles directly |
| Map tiles | Protomaps PMTiles (self-hosted) | Single-file vector tiles served via nginx Range requests — no tile server process needed |
| Routing | **GraphHopper** (self-hosted, Apache 2.0) | Custom motorcycle profile + curvy-weighted custom model, alternative routes, round-trip algorithm |
| Geocoding | **Photon** (komoot, Apache 2.0) | Fast autocomplete on OSM data; ~5× lighter than Nominatim. Germany index built locally from fresh Geofabrik data — see [infra/GEOCODER.md](infra/GEOCODER.md) |
| Backend API | FastAPI (Python 3.12) | Curvature scoring, GraphHopper / Photon HTTP clients, FastAPI auto-OpenAPI |
| Spatial DB | PostgreSQL 16 + PostGIS | Future: persistent per-segment curvature scores (Phase 2 ETL) |
| Elevation | SRTM via GraphHopper's elevation provider | Adds the 3rd ordinate to route geometry; powers the elevation chart |
| Infrastructure | Hetzner VPS + Docker Compose | Cheap, self-hosted, scales to one country comfortably |

No third-party APIs, no rate-limited free tiers, no API keys. **OpenStreetMap data (ODbL)** is the only required input — attribution rendered by MapLibre from the tile source.

---

## Directory Structure

```
frontend/                 React + Vite app
  src/
    components/           Map, RoutePanel, NavOverlay, dialogs, …
    hooks/                useRoute, useNavigation, useNavDebug, useTTS, …
    i18n/                 strings.ts (de + en), LocaleProvider
    lib/                  gpx, maneuver, storage helpers
    api/client.ts         /api/* fetch wrapper
    tts/                  TTS engine abstraction (WebSpeech + Piper stub)
backend/                  FastAPI service
  app/
    main.py               app + CORS + router registration
    routers/route.py      /route — primary + alternatives
    routers/search.py     /search — Photon adapter
    routers/score.py      /score
    services/             graphhopper, geocoder, curvature
routing/                  GraphHopper config + custom model
  config.yml              two profiles: motorcycle, motorcycle_curvy
  motorcycle_curvy.json   penalises highways, rewards tertiary roads
infra/
  docker-compose.yml          base stack: nginx + backend + graphhopper + photon + postgres
  docker-compose.override.yml local dev — publishes nginx on :80 (auto-loaded)
  docker-compose.prod.yml     production — Caddy entrypoint + HTTPS, memory tuning
  docker-compose.import.yml   local-only Photon index builder (Nominatim + importer)
  caddy/Caddyfile             reverse proxy + automatic Let's Encrypt TLS
  photon/Dockerfile           Photon image — builds AND serves the geocoder index
  scripts/push-geocoder.sh    rsync the built Photon index to the server
  nginx/nginx.conf            serves frontend, proxies /api/, serves /tiles/ PMTiles
  tiles/                      place map.pmtiles here (gitignored)
  data/osm/                   place map.osm.pbf here (gitignored)
  DEPLOY.md                   full production deployment plan
  GEOCODER.md                 how to build + ship the Photon Germany index
etl/                          Offline curvature ETL (Phase 2 — stub)
```

---

## Deployment

**Production** — the full step-by-step plan (domain, Hetzner server, hardening, HTTPS, data, deploy, updates) lives in **[infra/DEPLOY.md](infra/DEPLOY.md)**. Target is a ~€14/month Hetzner CX42 serving [schraeglage-maps.de](https://schraeglage-maps.de) behind Caddy with automatic Let's Encrypt TLS.

**Geocoder data** — Photon serves a Germany-only index you build yourself from current Geofabrik data; no giant planet download, no stale prebuilt dumps. See **[infra/GEOCODER.md](infra/GEOCODER.md)**.

### Local development

Prerequisites: Docker + Docker Compose, Node 20, ~30 GB free disk.

1. **Data files** (gitignored — download separately):
   - PMTiles → `infra/tiles/map.pmtiles` ([maps.protomaps.com/builds](https://maps.protomaps.com/builds/), cut a Germany bbox)
   - OSM PBF → `infra/data/osm/map.osm.pbf` ([download.geofabrik.de](https://download.geofabrik.de/europe/germany-latest.osm.pbf))
   - Photon index → `infra/photon-index/` (build per [infra/GEOCODER.md](infra/GEOCODER.md))
2. **Config:** `cp infra/.env.example infra/.env` and set `POSTGRES_PASSWORD`.
3. **Run the stack:**
   ```bash
   cd infra
   docker compose --profile geocoder up -d --build
   ```
   `docker-compose.override.yml` is auto-loaded and publishes nginx on `:80`. GraphHopper imports the routing graph on first start (~5–8 min for Germany; the healthcheck waits it out). Elevation is pulled from SRTM on demand into a persisted cache volume.
4. **Frontend HMR** (optional, for UI work):
   ```bash
   cd frontend && npm run dev      # http://localhost:5173, proxies /api → :80
   ```
5. **Backend on host** (optional): `cd backend && uvicorn app.main:app --reload --port 8000`

Open <http://localhost>.

---

## Architecture

```
Browser (React + MapLibre GL JS)
    │
    ├── PMTiles (served as static asset from nginx, byte-range reads)
    │
    └── FastAPI backend
            ├── /route   → GraphHopper (custom motorcycle profile + custom model)
            ├── /search  → Photon (Apache 2.0 geocoder)
            └── /score   → live curvature computation per LineString

PostgreSQL + PostGIS
    └── (reserved for Phase 2 persistent curvature index)

PMTiles served by nginx — no tile server process
```

---

## Data refresh

All three datasets freeze at the date they were downloaded. Refresh is manual today:

- **Photon geocoder** — rebuild the Germany index locally from fresh Geofabrik data and push it to the server: [infra/GEOCODER.md](infra/GEOCODER.md).
- **GraphHopper graph** — replace `infra/data/osm/map.osm.pbf`, clear the `graphhopper-cache` volume, restart (see [infra/DEPLOY.md](infra/DEPLOY.md) §12).
- **PMTiles** — replace `infra/tiles/map.pmtiles` with a fresh build.

A fully automated refresh pipeline (cron / timer / refresh-job container) is still in design — see [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

---

## Licensing

- **OSM data** — ODbL. Attribution always visible (rendered by MapLibre from the tile source). ODbL allows commercial use; the algorithm and UI are yours to monetise freely.
- **Map style / Protomaps basemaps** — MIT.
- **GraphHopper** — Apache 2.0.
- **Photon** — Apache 2.0.
- **Elevation (SRTM / Copernicus DEM)** — Public Domain / CC-BY.

---

## Status

Phase 1 (map shell, A→B routing, multi-waypoint editing, GPX, voice cues, mobile UI, alternatives, recentre) — **done**. Phase 2 (persistent per-segment curvature in PostGIS) — partial; live scoring works, PostGIS ETL not started. Phase 3 (curvy loop generator) — partial; GraphHopper's `round_trip` algorithm is wired and works, but it's not yet using a curvature-weighted graph. Phase 4 (auth + monetisation) — not started.
