FROM ghcr.io/graalvm/native-image-community:25 AS graal
RUN mkdir /opt/ci-java && cp -a "$JAVA_HOME"/. /opt/ci-java/
FROM moby/buildkit:v0.23.2 AS buildkit
FROM node:24.20.0-trixie
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv git skopeo \
      build-essential zlib1g-dev ca-certificates unzip zip libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=graal /opt/ci-java /opt/java
COPY --from=buildkit /usr/bin/buildctl /usr/local/bin/buildctl
ENV JAVA_HOME=/opt/java
ENV PATH=/opt/java/bin:/opt/venv/bin:$PATH
COPY ci/jenkins/requirements.txt /tmp/requirements.txt
RUN python3 -m venv /opt/venv && pip install --no-cache-dir -r /tmp/requirements.txt \
    && npm install -g corepack@0.34.6 && corepack prepare yarn@4.18.0 --activate \
    && java -version && native-image --version && buildctl --version
USER 1000:1000
ENV HOME=/home/node
WORKDIR /home/node
