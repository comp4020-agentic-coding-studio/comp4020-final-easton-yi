# syntax = docker/dockerfile:1

# Stillwood: one Node process (HTTP + WebSocket) with one coordinator worker
# that owns SQLite and the Rapier worlds. Serves HTTP on 0.0.0.0:$PORT
# (fly.toml sets PORT), keeps all durable state on the /data volume, and
# renders README.md at /readme/ (spec/README.md says what's checked).

ARG NODE_VERSION=24.21.0

FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim AS base
RUN npm install -g pnpm@11.9.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Toolchain only in case better-sqlite3 has no prebuilt binary for this platform.
FROM base AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/* \
    && pnpm install --frozen-lockfile --prod

FROM docker.io/library/node:${NODE_VERSION}-bookworm-slim
ENV NODE_ENV=production DATA_DIR=/data
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json README.md ./
COPY docs ./docs
# Fails at startup if /data isn't a writable mount; never falls back to /tmp.
CMD ["node", "dist/server/main.js"]
