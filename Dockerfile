# syntax=docker/dockerfile:1.7

# ---- Stage 1: build ---------------------------------------------------------
# Compile TypeScript to JavaScript in a throw-away stage. We need dev
# dependencies (typescript, etc.) here but won't ship them.
FROM node:22-alpine AS builder

WORKDIR /app

# Copy lockfiles first so Docker can cache `npm ci` when source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev dependencies so the production stage can copy a slim
# node_modules tree instead of re-downloading.
RUN npm prune --omit=dev

# ---- Stage 2: runtime -------------------------------------------------------
FROM node:22-alpine AS runtime

# Signals to Fastify / libraries that we're in production.
ENV NODE_ENV=production
ENV PORT=5000

# wget is used by HEALTHCHECK; tini gives us proper signal handling so
# SIGTERM from the orchestrator reaches Node and triggers the graceful
# shutdown hook registered in server.ts.
RUN apk add --no-cache tini wget

WORKDIR /app

# Copy only what's needed to run. The `node` user is preinstalled in
# the official image (uid 1000) — we chown to it and drop privileges.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

USER node

EXPOSE 5000

# Probe the real /health endpoint (which pings Mongo) — not just the
# TCP port, so orchestrators restart the container if the DB handle
# goes bad.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --quiet --spider --tries=1 http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
