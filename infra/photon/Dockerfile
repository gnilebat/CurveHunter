# Photon geocoder — ONE image used for BOTH building the index
# (docker-compose.import.yml, run locally) and serving it
# (docker-compose.yml, runs on the server).
#
# Using a single pinned version on both sides is deliberate: a Photon index
# built by version X may not open under version Y, and the failure is silent
# (empty search results, no clear error). Build + serve from the same image
# and that whole class of bug disappears.

FROM eclipse-temurin:21-jre

# ⚠ Check the latest release at https://github.com/komoot/photon/releases
#   and bump this. Whatever value you use here MUST be the value the server
#   was last built with — rebuild the server image after changing it.
ARG PHOTON_VERSION=1.1.0

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl wget ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fSL --create-dirs -o /photon/photon.jar \
      "https://github.com/komoot/photon/releases/download/${PHOTON_VERSION}/photon-${PHOTON_VERSION}.jar"

WORKDIR /photon
EXPOSE 2322

# Default = SERVE mode: Photon opens ./photon_data and serves the API on
# :2322. `-listen-ip 0.0.0.0` is required — Photon otherwise binds 127.0.0.1
# and the backend container can't reach it across the Docker network.
# The import stack overrides this CMD with `-nominatim-import ...`.
ENTRYPOINT ["java", "-jar", "/photon/photon.jar"]
CMD ["-listen-ip", "0.0.0.0"]
