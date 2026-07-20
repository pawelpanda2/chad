# Multi-stage Dockerfile for history-worker
# Builds a Node.js app that watches MongoDB change streams and records history

FROM node:18-alpine AS builder

WORKDIR /build

# Copy root workspace files
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/history-worker ./packages/history-worker

# Install only production dependencies for history-worker
RUN npm install --global pnpm@9.15.4 && \
    pnpm install --prod --filter=history-worker

# Runner stage — minimal production image
FROM node:18-alpine AS runner

WORKDIR /app

# Copy only what's needed from builder
COPY --from=builder /build/node_modules /app/node_modules
COPY --from=builder /build/packages/history-worker /app

# Node.js already in PATH, doesn't need npm/pnpm at runtime
RUN apk add --no-cache dumb-init

# Use dumb-init to handle signals correctly (same pattern as dashboard)
ENTRYPOINT ["/usr/sbin/dumb-init", "--"]
CMD ["node", "index.mjs"]
