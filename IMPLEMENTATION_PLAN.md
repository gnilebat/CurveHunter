# CurveHunter — Implementation Plan

## Guiding Principle

Fully self-hosted. No free tiers, no trial APIs, no third-party services that can be revoked or rate-limited. Everything runs on your own infrastructure. All components are open-source and commercially usable.

---

## Data Sources

| Source | What it gives you | License | How to get it |
|---|---|---|---|
| **OpenStreetMap (OSM)** | Road geometry, surface type, road class | ODbL — commercial OK with attribution | Download PBF from Geofabrik |
| **SRTM / Copernicus DEM** | Elevation data | Public Domain / CC-BY | Download from NASA EarthData or Copernicus |
| **Geofabrik** | OSM regional PBF extracts | Free to download | geofabrik.de/downloads |

**OSM ODbL:** You must display OSM attribution in the UI. Your app's algorithm, UI, and business logic are yours to monetize freely.

---

## Localisation

The UI defaults to German with English available as a runtime toggle. The map basemap labels follow the same locale via `@protomaps/basemaps`' `lang` option. Strings live in a single catalogue (`frontend/src/i18n/strings.ts`) — German is the source of truth. Adding a new language is one entry in that file. The selected locale persists in `localStorage`. OSM road names on the map render in their tagged language (typically German for Germany) regardless of UI locale, because that's the underlying data.

## Tech Stack (fully self-hosted)

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + TypeScript + Vite | Fast DX, strong ecosystem |
| Map rendering | MapLibre GL JS | MIT license, reads PMTiles natively |
| Map tiles | **Protomaps PMTiles** (self-hosted) | Single-file tile format, no tile server process needed |
| Geocoding | **Nominatim** (self-hosted) | Full OSM geocoder, Docker image available |
| Routing engine | **GraphHopper** (self-hosted) | Custom routing profiles, motorcycle support, Apache 2.0 |
| Backend API | **FastAPI** (Python) | Best fit for data-heavy Python algorithm work |
| Database | **PostgreSQL + PostGIS** | Spatial queries, stores pre-computed curvature scores |
| Elevation | SRTM via `elevation` Python lib | Joins with road segments during ETL |
| Infrastructure | **Hetzner VPS** | Best price/performance in Europe (~€40-80/mo) |
| Payments | **Stripe** | Self-integrated, no platform cut beyond Stripe fees |

---

## Architecture

```
Browser (React + MapLibre GL JS)
    │
    ├── PMTiles file (served as static asset from VPS/nginx)
    │       └── downloaded from Protomaps, updated monthly
    │
    └── FastAPI backend
            ├── /route   → GraphHopper (self-hosted, same VPS or dedicated)
            ├── /score   → curvature + elevation score for a route
            ├── /search  → Nominatim (self-hosted)
            └── /auth    → user accounts, subscription status

PostgreSQL + PostGIS
    └── road_segments (geometry, curvature_score, surface, elevation_gain)
    └── users, subscriptions, saved_routes

Offline ETL pipeline (Python, run manually or on a schedule)
    ├── Download OSM PBF from Geofabrik
    ├── Extract road geometries with pyosmium
    ├── Compute curvature score per segment
    ├── Join elevation from SRTM DEM
    └── Upsert into PostGIS
```

---

## Map Tiles: Protomaps PMTiles

PMTiles is a single-file archive of vector map tiles. MapLibre GL JS reads byte ranges from it directly — no tile server process required.

1. Download a PMTiles file for your region from `maps.protomaps.com/builds/` (free to download, no account needed)
2. Serve the file from nginx with `Range` request support (one config line)
3. Point MapLibre at it: `pmtiles://https://yourserver.com/map.pmtiles`
4. For global coverage, the planet file is ~110GB. Europe is ~20GB. A country is 1–5GB.

Update by downloading a new file monthly and swapping it in — zero downtime with nginx.

---

## Routing: Self-hosted GraphHopper

GraphHopper ingests an OSM PBF file and builds a routing graph. Supports custom routing profiles written in a simple scripting language.

**Motorcycle profile customisations:**
- Penalise `highway=motorway`, `highway=trunk`
- Penalise roads with `surface=asphalt` and low curvature score
- Reward `highway=secondary`, `highway=tertiary`, mountain passes
- Avoid unpaved roads by default (toggle for adventure mode)

**Hardware requirements (self-hosted):**
- A single country (e.g. Germany): ~4GB RAM, 10GB disk
- All of Europe: ~16GB RAM, 40GB disk
- Hetzner CX31 (8GB RAM, €10/mo) handles most countries comfortably

---

## Curviness Algorithm

Core formula applied per OSM road segment:

```
curvature = Σ |Δbearing| / segment_length_km
```

Score interpretation:
- 0–100: Nearly straight (highways, main roads)
- 100–500: Mildly winding
- 500–1000: Notably curvy
- 1000+: Switchbacks, mountain passes

Additional scoring factors:
- **Surface type** — gravel/unpaved bonus for adventure riders (OSM `surface` tag)
- **Elevation gain** — computed from SRTM DEM joined to road geometry
- **Road class** — tertiary/unclassified roads weighted higher (less traffic)
- **Isolation** — roads far from urban areas scored higher

Reference: [Road Curvature](https://github.com/Vestride/road-curvature) OSS project (Python, Apache 2.0).

---

## Implementation Phases

### Phase 1 — Map shell (1–2 weeks)
1. Scaffold React + TypeScript + Vite
2. Download PMTiles for target region, serve via nginx
3. MapLibre GL JS renders the map with a motorcycle-appropriate style
4. Basic A→B routing via self-hosted GraphHopper
5. Route drawn on map

### Phase 2 — Curviness engine (2–3 weeks)
1. Set up PostGIS, run ETL pipeline on OSM PBF + SRTM data
2. FastAPI `/score` endpoint — score any GeoJSON LineString
3. Colour-code routes on map by curviness
4. Curviness filter on the route request (min curvature threshold)

### Phase 3 — Curvy route generator (3–4 weeks)
1. "Find me a curvy loop from X" — user picks start, distance, and curviness preference
2. GraphHopper custom profile + curvature-weighted road graph
3. GPX export
4. Self-hosted Nominatim for place search

### Phase 4 — User accounts + monetisation
1. Auth (email/password or OAuth — self-hosted with Auth.js or Keycloak)
2. Stripe integration for subscriptions
3. Freemium gating: route saves, GPX export, loop generator behind paywall
4. OSM attribution always visible (ODbL requirement)

---

## Infrastructure (Hetzner)

Suggested setup for launch:

| Server | Spec | Role | Cost |
|---|---|---|---|
| CX32 | 8 vCPU, 16GB RAM | App server (FastAPI + Nominatim + nginx) | ~€20/mo |
| CX32 | 8 vCPU, 16GB RAM | GraphHopper routing | ~€20/mo |
| CPX11 | 2 vCPU, 4GB RAM | PostgreSQL + PostGIS | ~€10/mo |

Total: ~€50/mo. Can collapse to a single server (CX52, 16 vCPU, 32GB, ~€80/mo) for simplicity.

---

## What to Build First

Download the PMTiles file for your country/region and get MapLibre rendering it on a local nginx server. That gives you a fully offline, dependency-free map in under an hour and proves the self-hosted tile approach works before writing a line of app code.
