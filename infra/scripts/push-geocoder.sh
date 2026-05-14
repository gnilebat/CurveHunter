#!/usr/bin/env bash
# Push the locally-built Photon Germany index to the Hetzner server and
# restart the photon container. Run this after building the index with
# docker-compose.import.yml.
#
# Config via env (or edit the defaults below):
#   GEOCODER_SERVER      ssh target, e.g. deploy@schraeglage-maps.de
#   GEOCODER_REMOTE_DIR  path to infra/photon-index on the server
set -euo pipefail

SERVER="${GEOCODER_SERVER:-deploy@your-hetzner-host}"
REMOTE_DIR="${GEOCODER_REMOTE_DIR:-/opt/curvehunter/infra/photon-index}"
REMOTE_INFRA="$(dirname "$REMOTE_DIR")"

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/photon-index"

if [ ! -d "$LOCAL_DIR/node_1" ]; then
  echo "✗ $LOCAL_DIR/node_1 not found." >&2
  echo "  Build the index first:  docker compose -f docker-compose.import.yml ..." >&2
  echo "  (see GEOCODER.md)" >&2
  exit 1
fi

SIZE="$(du -sh "$LOCAL_DIR" | cut -f1)"
echo "→ Syncing Photon index ($SIZE) to $SERVER:$REMOTE_DIR"

# --delete so stale files from an older index don't linger. Compression helps
# over a home uplink; the Lucene segments are already fairly dense though.
rsync -avz --delete --partial --progress \
  "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/"

echo "→ Restarting photon on the server"
ssh "$SERVER" "cd '$REMOTE_INFRA' && docker compose --profile geocoder up -d --force-recreate photon"

echo "✓ Done. Verify:  curl 'http://<server>/api/search?q=Berlin'"
