# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Schräglage Maps (formerly "CurveHunter") is a motorcycle route planning web app, deployed at `schraeglage-maps.de`. The core differentiator is a curviness scoring algorithm that rates roads by angular deviation per kilometer, allowing riders to find and generate curvy, fun routes. See IMPLEMENTATION_PLAN.md for full details. Note that the on-disk repo folder is still `CurveHunter/` — only the user-facing brand changed.

## Stack (fully self-hosted, no third-party APIs)

- **Frontend:** React + TypeScript + Vite, MapLibre GL JS for map rendering
- **Map tiles:** Protomaps PMTiles (static file served via nginx with range-request support)
- **Routing engine:** GraphHopper (self-hosted, custom motorcycle profiles)
- **Geocoding:** Nominatim (self-hosted, mediagis/nominatim Docker image)
- **Backend:** FastAPI (Python 3.12)
- **Database:** PostgreSQL 16 + PostGIS
- **Infrastructure:** Hetzner VPS, orchestrated with Docker Compose

## Localisation

The UI is German by default with English available as a toggle. All visible UI strings live in [frontend/src/i18n/strings.ts](frontend/src/i18n/strings.ts) (`strings.de` is the source of truth). Components consume them via the `useT()` hook from [frontend/src/i18n/LocaleProvider.tsx](frontend/src/i18n/LocaleProvider.tsx). The selected locale is persisted in `localStorage` under `curvehunter.locale` and also drives the map's basemap-label language (`@protomaps/basemaps` `lang` option). When adding new UI text, add the key to both `de` and `en` — never inline literal strings in components.

## Directory Structure

```
frontend/        React + Vite app (MapLibre GL JS + PMTiles + @protomaps/basemaps)
  src/i18n/      Locale provider + UI string catalogues (de, en)
backend/         FastAPI API server
  app/
    main.py      FastAPI app, CORS middleware, router registration
    routers/     route.py, search.py, score.py
    services/    graphhopper.py, nominatim.py  (thin HTTP clients)
routing/         GraphHopper config
  config.yml                 two profiles: motorcycle, motorcycle_curvy
  motorcycle_curvy.json      custom model — penalises highways, rewards tertiary roads
etl/             Offline curvature ETL (Phase 2)
  compute_curvature.py       reads OSM PBF → computes score → upserts PostGIS
infra/
  docker-compose.yml         nginx + backend + graphhopper + nominatim + postgres
  nginx/nginx.conf           serves frontend, proxies /api/, serves /tiles/ PMTiles
  tiles/                     place map.pmtiles here (gitignored)
  data/osm/                  place map.osm.pbf here (gitignored)
```

## Development Commands

```bash
# Frontend dev server (proxies /api → localhost:8000)
cd frontend && npm run dev

# Frontend production build
cd frontend && npm run build

# Backend dev server
cd backend && uvicorn app.main:app --reload --port 8000

# Full stack via Docker Compose
cd infra && docker compose up

# ETL: compute curvature scores from OSM PBF
cd etl && python compute_curvature.py --pbf /data/map.osm.pbf --dsn postgresql://... [--dem /data/dem.tif]
```

## Data Setup (required before first run)

1. Download a PMTiles file for your region from `maps.protomaps.com/builds/` → place in `infra/tiles/map.pmtiles`
2. Download an OSM PBF for your region from `download.geofabrik.de` → place in `infra/data/osm/map.osm.pbf`
3. Copy `.env.example` to `infra/.env` and set `POSTGRES_PASSWORD`
4. Run `docker compose up` — GraphHopper will auto-import the PBF on first start (takes ~5 min per country)

## Key Architectural Decisions

**PMTiles:** MapLibre GL JS reads tile data directly from the `.pmtiles` file via HTTP byte-range requests. No tile server process is needed — nginx serves it as a static file. The `Protocol` class from the `pmtiles` npm package registers the `pmtiles://` URL scheme.

**Two routing profiles:** `motorcycle` uses the standard fastest weighting. `motorcycle_curvy` uses a custom model that heavily penalises motorways/trunks and rewards secondary/tertiary roads. The frontend sends `prefer_curvy: true/false`.

**Curvature formula:** `Σ |Δbearing| / length_km` — total angular deviation per kilometre. Computed live in the `/score` endpoint for any GeoJSON LineString. Pre-computed per OSM segment by the ETL pipeline for Phase 2 queries.

**OSM attribution:** ODbL requires visible attribution. It is rendered by MapLibre from the `attribution` field in the tile source definition (`Map.tsx`). Do not remove it.

## Data & Licensing

All map data comes from OpenStreetMap (ODbL license). OSM attribution must always be visible in the UI. The ODbL allows commercial use; the app's algorithm and UI code are not considered part of the derivative database. Elevation data from SRTM/Copernicus DEM (public domain).
