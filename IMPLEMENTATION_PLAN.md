# Schräglage — Implementation Plan

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

### Phase 1 — Map shell (1–2 weeks) — **Done**
1. Scaffold React + TypeScript + Vite — done
2. Download PMTiles for target region, serve via nginx — done (Germany ~7 GB)
3. MapLibre GL JS renders the map with a motorcycle-appropriate style — done (Protomaps basemap, light + dark themes, DE/EN labels)
4. Basic A→B routing via self-hosted GraphHopper — done (`motorcycle` + `motorcycle_curvy` profiles, configurable custom model)
5. Route drawn on map — done (per-segment colour by live curviness score)
6. N-waypoint routing with drag-to-place markers, insert/remove waypoints — done
7. Bottom-sheet UI for portrait/mobile with drag-to-resize handle — done
8. Min-zoom + max-bounds clamped to PMTiles coverage (no grey void) — done

### Phase 2 — Curviness engine (2–3 weeks) — **Partial**
1. Set up PostGIS, run ETL pipeline on OSM PBF + SRTM data — **not started** (stack provisioned, ETL script stubbed)
2. FastAPI `/score` endpoint — score any GeoJSON LineString — **live-computed** (no ETL persistence yet)
3. Colour-code routes on map by curviness — done (per-segment + highway tinting)
4. Curviness filter on the route request (min curvature threshold) — done (curviness slider 0–200%, min-curve-speed, ignore-urban-curves, avoid-unpaved)
5. **Next:** persist per-segment curvature in PostGIS so curvy-loop generation has a weighted graph to query

### Phase 3 — Curvy route generator (3–4 weeks) — **Not started, key differentiator**
1. "Find me a curvy loop from X" — user picks start, distance, and curviness preference
2. GraphHopper custom profile + curvature-weighted road graph (requires Phase 2 ETL)
3. Self-hosted Nominatim for place search — done (Germany import; HTTP serving)

### Phase 4 — User accounts + monetisation — **Not started**
1. Auth (email/password or OAuth — self-hosted with Auth.js or Keycloak)
2. Stripe integration for subscriptions
3. Freemium gating: route saves, GPX export, loop generator behind paywall
4. OSM attribution always visible (ODbL requirement) — **already enforced** via MapLibre source attribution

---

## Phase 1.5 — Rider QoL (in-flight)

Built on top of the core, mostly without backend changes. **Status as of the current branch:**

### Done
- **Localised UI** — German default + English toggle (i18n catalogue, persisted in `localStorage`).
- **Route presets** — Fastest / Kurven / Kurven Plus / Kurven Max. Custom presets save/load/rename/delete with confirmation.
- **Custom user storage** (no account needed) — saved routes, custom presets, saved places, all in `localStorage` with versioned `v: 1` schemas; `navigator.storage.persist()` requested at startup to resist eviction.
- **Saved places in autocomplete** — typing surfaces matching saved places first, with a star badge, before Nominatim results.
- **Turn-by-turn navigation** with live position, distance-to-next-turn, off-route detection, ETA, arrival, route follow camera.
- **Voice cues** at 500 / 200 / 50 m + arrival + off-route, composed from i18n strings + GraphHopper street names. Pluggable engine abstraction (Web Speech today; Piper stub in place).
- **Wake lock** during nav (re-acquired on `visibilitychange`).
- **PWA-style background-audio warning** popup (one-session + persistent dismiss).
- **Debug navigation simulator** — drag a slider or auto-play position along the route, smooth rAF interpolation, "next turn" jump.
- **Mobile bottom-sheet panel** with seamless drag-to-resize handle; map pans up until 50 % viewport then locks.
- **Draggable waypoint markers** for fine-position tuning.
- **GPX export** of the current route.
- **Saved routes restore options atomically** (no race with auto-router).
- **Round-trip / curvy loop generator** — pick a start + distance (10–300 km), get a closed loop. Uses GraphHopper's `round_trip` algorithm on the `motorcycle_curvy` profile, with a shuffle button for alternate seeds.
- **Elevation profile chart** under the route stats — SVG line+area from the 3rd ordinate of `route.geometry`; shows ascent/descent + min/max elevation.
- **Speed-limit overlay** during navigation — red-ring badge with the current edge's `max_speed`; pulses when the rider is more than 5 km/h over.

### Top of the backlog
Sorted by impact / effort:

| Idea | Why | Notes |
|---|---|---|
| **Route alternatives (2–3 candidates)** | "Curviest" optimisation often misses obvious good roads | GraphHopper `algorithm=alternative_route` |
| **Share route via URL** | Default expectation for any modern route planner | Encode waypoints + options in query string |
| **Drag the route line to add a via point** (Google Maps style) | Existing waypoint drag covers pins only | New gesture: click + drag on the route layer |
| **GPX import** | Round-trip with friends, Calimoto / Kurviger exchange | Parse `.gpx`, set waypoints + apply track as user-fixed path |
| **Reverse whole sequence** | Current swap only flips start ↔ end | One-liner in `useRoute` |
| **Recently used places** auto-history | Pair with saved-places UI | Capped list under a new key |
| **PWA install prompt + service worker** | Offline shell + "Add to home screen" | `vite-plugin-pwa`, ~30 min |
| **Speed-camera (Blitzer) overlay & voice alert** | Critical for riders in DE/AT — pre-warn at known fixed speed-cam locations | OSM `highway=speed_camera` nodes are public-domain; ingest into PostGIS, alert when within ~200 m and approaching. Note: mobile/temporary cameras aren't in OSM — would need an external feed |
| **"Recentre" floating button** during nav | If the user pans away from their position | One button + `easeTo` to user pos |
| **Pre-departure summary screen** | "212 km · 87 % Landstraße · 3 Pässe" before pressing Start | Aggregates existing route metadata |
| **Curvature heatmap layer** on the bare map | Passive discovery of fun roads | Built once Phase 2 ETL fills PostGIS |
| **Riding-mode preset family** (Touring / Sport / Adventure / Off-road) | Apply coherent option bundles, less slider fiddling | Extends `ROUTE_PRESETS` |
| **Day/night basemap auto-switch** by local sunset | Theming exists, just gate on time | `SunCalc` lib or simple latitude/time approx |
| **Native Android wrap via Capacitor** | Background voice + Play Store presence | Same React code; switch when PWA limits bite |
| **Piper TTS engine** (offline, neural) | Better German voices on devices with poor system TTS | Engine interface already in place at `src/tts/engines.ts` |

### Known limitations to revisit
- PWA voice stops when the screen locks or app is backgrounded — covered by an in-UI warning today; Capacitor is the eventual fix.
- Cross-device sync isn't possible without a backend account (Phase 4).

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
