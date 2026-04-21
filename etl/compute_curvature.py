"""
Phase 2 ETL: Compute curvature scores for OSM road segments and store in PostGIS.

Usage:
    python compute_curvature.py --pbf /data/map.osm.pbf --dsn postgresql://...

Requirements:
    pip install -r requirements.txt

The script:
1. Reads road ways from the OSM PBF file using osmium
2. Computes angular deviation per km (curvature score) for each way
3. Joins elevation gain from a local SRTM/Copernicus GeoTIFF
4. Upserts results into the road_segments PostGIS table
"""

import argparse
import math
import asyncio
import asyncpg
import osmium
import rasterio
from rasterio.sample import sample_gen
from shapely.geometry import LineString


# ── Curvature ──────────────────────────────────────────────────────────────────

def bearing(a: tuple, b: tuple) -> float:
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlon = lon2 - lon1
    x = math.sin(dlon) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.degrees(math.atan2(x, y))


def haversine_m(a: tuple, b: tuple) -> float:
    R = 6_371_000
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def compute_curvature(coords: list[tuple]) -> tuple[float, float]:
    """Returns (curvature_score, length_km)."""
    if len(coords) < 3:
        return 0.0, 0.0
    total_angle = 0.0
    total_dist = 0.0
    for i in range(1, len(coords) - 1):
        b1 = bearing(coords[i - 1], coords[i])
        b2 = bearing(coords[i], coords[i + 1])
        delta = abs(b2 - b1)
        if delta > 180:
            delta = 360 - delta
        total_angle += delta
        total_dist += haversine_m(coords[i - 1], coords[i])
    total_dist += haversine_m(coords[-2], coords[-1])
    length_km = total_dist / 1000
    return (total_angle / length_km if length_km > 0 else 0.0), length_km


# ── Elevation ──────────────────────────────────────────────────────────────────

def elevation_gain(coords: list[tuple], dem_path: str) -> float:
    """Compute total ascent in metres using a local DEM GeoTIFF."""
    points = [(c[1], c[0]) for c in coords]  # (lon, lat) for rasterio
    with rasterio.open(dem_path) as src:
        elevations = [v[0] for v in src.sample(points)]
    gain = 0.0
    for i in range(1, len(elevations)):
        diff = elevations[i] - elevations[i - 1]
        if diff > 0:
            gain += diff
    return gain


# ── OSM reader ─────────────────────────────────────────────────────────────────

ROUTABLE_HIGHWAYS = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "motorway_link", "trunk_link",
    "primary_link", "secondary_link", "tertiary_link"
}


class WayHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.ways: list[dict] = []

    def way(self, w):
        highway = w.tags.get("highway")
        if highway not in ROUTABLE_HIGHWAYS:
            return
        coords = [(n.lat, n.lon) for n in w.nodes if n.location.valid()]
        if len(coords) < 2:
            return
        self.ways.append({
            "osm_id": w.id,
            "highway": highway,
            "surface": w.tags.get("surface", ""),
            "name": w.tags.get("name", ""),
            "coords": coords
        })


# ── DB ──────────────────────────────────────────────────────────────────────────

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS road_segments (
    osm_id       BIGINT PRIMARY KEY,
    highway      TEXT,
    surface      TEXT,
    name         TEXT,
    curvature    FLOAT,
    length_km    FLOAT,
    ascent_m     FLOAT,
    geom         GEOMETRY(LineString, 4326)
);
CREATE INDEX IF NOT EXISTS road_segments_geom_idx ON road_segments USING GIST(geom);
"""

UPSERT = """
INSERT INTO road_segments (osm_id, highway, surface, name, curvature, length_km, ascent_m, geom)
VALUES ($1, $2, $3, $4, $5, $6, $7, ST_GeomFromText($8, 4326))
ON CONFLICT (osm_id) DO UPDATE SET
    curvature = EXCLUDED.curvature,
    length_km = EXCLUDED.length_km,
    ascent_m  = EXCLUDED.ascent_m,
    geom      = EXCLUDED.geom;
"""


async def run(pbf_path: str, dsn: str, dem_path: str | None):
    print(f"Reading {pbf_path}…")
    handler = WayHandler()
    handler.apply_file(pbf_path, locations=True)
    print(f"  {len(handler.ways)} routable ways found")

    conn = await asyncpg.connect(dsn)
    await conn.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    await conn.execute(CREATE_TABLE)

    batch = []
    for i, way in enumerate(handler.ways):
        coords = way["coords"]
        score, length_km = compute_curvature(coords)
        ascent = elevation_gain(coords, dem_path) if dem_path else 0.0
        ls = LineString([(c[1], c[0]) for c in coords])
        batch.append((
            way["osm_id"], way["highway"], way["surface"], way["name"],
            score, length_km, ascent, ls.wkt
        ))
        if len(batch) >= 500:
            await conn.executemany(UPSERT, batch)
            batch.clear()
            print(f"  {i + 1}/{len(handler.ways)} ways processed…", end="\r")

    if batch:
        await conn.executemany(UPSERT, batch)

    await conn.close()
    print(f"\nDone. {len(handler.ways)} segments upserted.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pbf", required=True, help="Path to OSM PBF file")
    parser.add_argument("--dsn", required=True, help="PostgreSQL DSN")
    parser.add_argument("--dem", default=None, help="Path to DEM GeoTIFF (optional)")
    args = parser.parse_args()
    asyncio.run(run(args.pbf, args.dsn, args.dem))
