# Compandium tenant image: Postgres 17 + pgvector + gbrain + compandium-agent.
# One container per tenant; all state lives under /data (a Fly volume).
FROM postgres:17-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl git unzip postgresql-17-pgvector \
 && rm -rf /var/lib/apt/lists/*

# Bun runtime (runs gbrain from source and our supervisor/agent)
RUN curl -fsSL https://bun.sh/install | bash \
 && ln -s /root/.bun/bin/bun /usr/local/bin/bun

# gbrain, pinned by ref for reproducible tenant rollouts (upgrade = new image)
ARG GBRAIN_REF=master
RUN git clone --depth 1 --branch ${GBRAIN_REF} https://github.com/garrytan/gbrain /opt/gbrain \
 && cd /opt/gbrain \
 && bun install --production \
 && printf '#!/bin/sh\nexec bun run /opt/gbrain/src/cli.ts "$@"\n' > /usr/local/bin/gbrain \
 && chmod +x /usr/local/bin/gbrain

COPY supervisor.ts /opt/compandium/supervisor.ts
COPY agent /opt/compandium/agent

# All persistent state: pgdata, gbrain home/config, department git repos
ENV PGDATA=/data/pgdata \
    COMPANDIUM_DATA=/data
VOLUME /data

# 8080 = gbrain serve --http (public: MCP + OAuth). 8081 = agent (private only).
EXPOSE 8080 8081

ENTRYPOINT ["bun", "run", "/opt/compandium/supervisor.ts"]
