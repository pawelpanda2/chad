# Multi-stage Dockerfile for history-worker
# Builds a Node.js app that watches MongoDB change streams and records history

FROM node:18-alpine AS builder

WORKDIR /build

# Copy all workspace files needed for pnpm install
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/history-worker ./packages/history-worker

# Install pnpm globally
RUN npm install --global pnpm@9.15.4

# Install dependencies for history-worker only
RUN pnpm install --filter=history-worker

# Use pnpm deploy to create a standalone node_modules structure
RUN pnpm deploy --filter=history-worker --prod /prod/history-worker

# Runner stage — minimal production image
FROM node:18-alpine AS runner

WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init

# Copy the deployed package (includes its own node_modules)
COPY --from=builder /prod/history-worker ./

# Use dumb-init to handle signals correctly (same pattern as dashboard)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "index.mjs"]