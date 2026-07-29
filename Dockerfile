# NODE container which runs this service.
# node:24-slim publishes linux/amd64 and linux/arm64, so this builds unchanged on both.
FROM node:24-slim AS builder

RUN mkdir -p /usr/ui

COPY /ui /usr/ui

WORKDIR /usr/ui

# Build UI from sources
RUN npm ci --silent

ENV NODE_ENV=production
ARG BUCKET_PATH
ARG PREDATOR_DOCS_URL

RUN VERSION=$(node -p -e "require('./package.json').version") && BUCKET_PATH=$BUCKET_PATH PREDATOR_DOCS_URL=$PREDATOR_DOCS_URL VERSION=$VERSION npm run build

# Server dependencies build in the full image (toolchain preinstalled) because
# sqlite3 must compile from source: its arm64 prebuilt binary links a newer
# glibc than node:24-slim ships, crashing at boot with ERR_DLOPEN_FAILED.
FROM node:24 AS server-deps

WORKDIR /usr
COPY package*.json /usr/
RUN npm ci --omit=dev --silent --build-from-source=sqlite3

FROM node:24-slim AS production

RUN mkdir -p /usr/src

WORKDIR /usr

# Install app dependencies, built in the full node image below.
COPY package*.json /usr/
COPY --from=server-deps /usr/node_modules /usr/node_modules
## Bundle app source
COPY /src /usr/src
COPY /docs /usr/docs
COPY --from=builder /usr/ui/dist /usr/ui/dist

CMD ["node", "--max_old_space_size=512", "./src/server.js" ]
