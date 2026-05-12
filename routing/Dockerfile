FROM eclipse-temurin:21-jre

ARG GH_VERSION=10.2
WORKDIR /graphhopper

RUN apt-get update && apt-get install -y --no-install-recommends curl wget ca-certificates && rm -rf /var/lib/apt/lists/*

RUN curl -fSL -o graphhopper-web.jar \
    "https://github.com/graphhopper/graphhopper/releases/download/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar"

EXPOSE 8989 8990

# Shell form so JAVA_OPTS from compose is honoured
CMD java $JAVA_OPTS -jar graphhopper-web.jar server config.yml
