# Geocoder (Photon) — build & deploy

The autocomplete is **Photon**, serving a **Germany-only** index. Instead of
downloading komoot/GraphHopper's prebuilt country dump (which goes stale) or
the planet dump (~88 GB, too big), you build a fresh Germany index yourself
from current Geofabrik data and push the finished ~6–8 GB artifact to the
server.

```
[ your dev machine ]                         [ Hetzner server ]
 germany-latest.osm.pbf                       docker-compose.yml
        │                                      photon service
        ▼                                          ▲
   Nominatim  ──►  Photon import  ──►  photon-index/ ──(rsync)──┘
  (temporary)      (docker-compose.import.yml)
```

The same `infra/photon/` image is used to **build** and to **serve**, so the
index is always version-compatible.

---

## Files

| File | Role |
|---|---|
| `photon/Dockerfile` | Photon image — pinned version, used for build **and** serve |
| `docker-compose.yml` → `photon` service | Serves `./photon-index` on the server |
| `docker-compose.import.yml` | **Local-only** build stack (Nominatim + Photon importer) |
| `scripts/push-geocoder.sh` | rsyncs `./photon-index` to the server + restarts photon |
| `import/pbf/` | You drop `germany-latest.osm.pbf` here (gitignored) |
| `photon-index/` | Build output / server input — the index itself (gitignored) |

---

## Build the index (locally, when you want fresh data)

**Requirements:** ~16 GB RAM (8 GB works but slow), ~60 GB free disk during
the run. The Nominatim DB is thrown away at the end.

### 1. Download the OSM extract

Geofabrik rebuilds this **daily**, so it's always current:

> **https://download.geofabrik.de/europe/germany-latest.osm.pbf**  (~4 GB)

Save it to:

```
infra/import/pbf/germany-latest.osm.pbf
```

### 2. Import into Nominatim (1–3 h, unattended)

```bash
cd infra
docker compose -f docker-compose.import.yml up nominatim
```

Wait until the logs settle on `Nominatim is ready to accept requests`. Leave
it running for the next step.

### 3. Build the Photon index (~20–40 min)

In a second terminal:

```bash
cd infra
docker compose -f docker-compose.import.yml run --rm photon-import
```

When it finishes, `infra/photon-index/` contains a `node_1/` directory — that
is the index.

### 4. Tear down the build stack

```bash
docker compose -f docker-compose.import.yml down -v
```

`-v` drops the ~40 GB throwaway Nominatim database. `infra/photon-index/`
stays — that's the artifact you keep.

---

## Deploy the index to the server

```bash
cd infra
GEOCODER_SERVER=deploy@your-hetzner-host ./scripts/push-geocoder.sh
```

It rsyncs `photon-index/` to the server and restarts the `photon` container.
First deploy: make sure the server has the repo checked out at the path the
script expects (default `/opt/curvehunter`) and that the `geocoder` profile is
part of how you bring the stack up:

```bash
docker compose --profile geocoder up -d
```

Verify:

```bash
curl 'http://<server>/api/search?q=Berlin'
```

---

## Refreshing later

Re-run the whole **Build** section whenever you want current data, then
**Deploy**. Nothing on the server changes between refreshes except the
contents of `photon-index/`.

## Upgrading Photon

Bump `PHOTON_VERSION` in `photon/Dockerfile` (check
<https://github.com/komoot/photon/releases>). You must then **rebuild the
index** with the new version *and* rebuild the server image — an index built
by one version may not open under another.
