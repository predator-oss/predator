# pnpm workspace build: the UI compiles in the full builder image, server
# dependencies install in their own stage, and the slim runtime gets only
# built output and production node_modules.
FROM node:24-slim AS builder

RUN corepack enable

WORKDIR /usr/app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ui/package.json ui/
RUN pnpm install --filter predator-ui --frozen-lockfile

COPY ui ./ui

ENV NODE_ENV=production
ARG BUCKET_PATH
ARG PREDATOR_DOCS_URL

# The UI shows the release version from the ROOT package.json — ui/package.json
# has its own stale version that never tracked releases.
RUN VERSION=$(node -p -e "require('/usr/app/package.json').version") && \
    BUCKET_PATH=$BUCKET_PATH PREDATOR_DOCS_URL=$PREDATOR_DOCS_URL VERSION=$VERSION \
    pnpm --filter predator-ui run build

# Server dependencies build in the full image (toolchain preinstalled) because
# sqlite3 must compile from source: its arm64 prebuilt binary links a newer
# glibc than node:24-slim ships, crashing at boot with ERR_DLOPEN_FAILED.
FROM node:24 AS server-deps

RUN corepack enable

WORKDIR /usr/app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ui/package.json ui/
RUN npm_config_build_from_source=true pnpm install --filter predator --prod --frozen-lockfile

FROM node:24-slim AS production

# WORKDIR stays /usr: the documented sqlite volume mount (-v ...:/usr/db with
# SQLITE_STORAGE=db/predator) and static paths are relative to it.
WORKDIR /usr

COPY package.json ./
COPY --from=server-deps /usr/app/node_modules ./node_modules
COPY /src ./src
COPY /docs ./docs
COPY --from=builder /usr/app/ui/dist ./ui/dist

CMD ["node", "--max_old_space_size=512", "./src/server.js" ]
