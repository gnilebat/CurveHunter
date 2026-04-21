# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CurveHunter is a motorcycle route planning web app. The core differentiator is a curviness scoring algorithm that rates roads by angular deviation per kilometer, allowing riders to find and generate curvy, fun routes. See IMPLEMENTATION_PLAN.md for full details.

## Stack (fully self-hosted, no third-party APIs)

- **Frontend:** React + TypeScript + Vite, MapLibre GL JS for map rendering
- **Map tiles:** Protomaps PMTiles (static file served via nginx, no tile server process)
- **Routing engine:** GraphHopper (self-hosted, custom motorcycle profile)
- **Geocoding:** Nominatim (self-hosted)
- **Backend:** FastAPI (Python)
- **Database:** PostgreSQL + PostGIS
- **Infrastructure:** Hetzner VPS
- **Payments:** Stripe

## Data & Licensing

All map data comes from OpenStreetMap (ODbL license). OSM attribution must always be visible in the UI. The ODbL allows commercial use; the app's algorithm and UI code are not considered part of the derivative database. Elevation data from SRTM/Copernicus DEM (public domain).

## Curviness Algorithm

Core formula: `curvature = Σ |Δbearing| / segment_length_km` applied per OSM road segment. Higher = more curves. Scoring is pre-computed in an offline ETL pipeline (Python + pyosmium) against OSM PBF dumps from Geofabrik, stored in PostGIS. The [Road Curvature](https://github.com/Vestride/road-curvature) OSS project is the reference implementation.
