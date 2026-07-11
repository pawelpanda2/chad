# Personal Dashboard - Next.js Application Dockerfile
#
# Built with the MONOREPO ROOT as build context (not this directory) — see
# docker-compose.*.yml at repo root: `build: {context: ., dockerfile:
# packages/dashboard/Dockerfile}`. This is required because dashboard depends
# on the workspace package `dba` ("dba": "workspace:*" in package.json,
# imported in 14+ files under app/api/** and lib/chad-dba/**) — a build
# context scoped to packages/dashboard/ can never see that sibling package.
# Building from repo root with pnpm is also why this no longer uses `npm ci`
# (there is no packages/dashboard/package-lock.json — this is a pnpm
# workspace, only a root pnpm-lock.yaml exists; `npm ci` here would either
# fail or silently try to resolve "dba": "workspace:*" from the npm registry).
#
# All stages use the same glibc base (node:20-bookworm-slim) rather than
# mixing Alpine (musl) for deps/builder and Debian (glibc) for runner —
# packages/dashboard/prisma/schema.prisma's binaryTargets only lists
# "linux-musl-arm64-openssl-3.0.x" (no plain x64 musl target), so an
# Alpine-built Prisma client would be missing its query engine on x64.

# ============================================
# Stage 1: deps — warm the pnpm store from the lockfile only (best layer cache)
# ============================================
FROM node:20-bookworm-slim AS deps
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ============================================
# Stage 2: builder — full monorepo source, offline install, build dba then dashboard
# ============================================
FROM node:20-bookworm-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /repo

COPY --from=deps /root/.local/share/pnpm/store /root/.local/share/pnpm/store
COPY . .

RUN pnpm install --offline --frozen-lockfile

ENV NEXT_TELEMETRY_DISABLED=1

# dba must build first — dashboard imports its dist/ output (workspace:*)
RUN pnpm --filter dba build

RUN pnpm --filter dashboard exec prisma generate

# Clean .next directory to avoid stale filesystem issues (especially on QNAP)
RUN rm -rf packages/dashboard/.next

RUN pnpm --filter dashboard build

# ============================================
# Stage 3: runner (production) — slim runtime, Next.js standalone output
# ============================================
FROM node:20-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    dumb-init \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Standalone output is nested under the app's repo-relative path since the
# build ran from the monorepo root (.next/standalone/packages/dashboard/...),
# not flattened — mirrors the source layout, matching outputFileTracingRoot
# in packages/dashboard/next.config.ts.
COPY --from=builder --chown=nextjs:nodejs /repo/packages/dashboard/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/packages/dashboard/.next/static ./packages/dashboard/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/packages/dashboard/public ./packages/dashboard/public

USER nextjs

EXPOSE 3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "packages/dashboard/server.js"]
