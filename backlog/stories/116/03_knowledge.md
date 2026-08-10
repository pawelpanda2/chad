# Story 116 — Knowledge

- `ai-docs/begin_here/01_ai_start.md` — DBA vs Content Provider layering
  (`Dashboard → dba → content-provider → provider`); Payments follows the
  same shape one level over (`Dashboard → dba → payments → Stripe`),
  confirmed as the required flow by the user's Input 2 correction.
- `ai-docs/begin_here/05_endpoint-rules.md` — no fake/stub Save; new dba
  methods get business-operation names, not raw provider method names;
  route stays a thin adapter.
- `packages/google-contacts/` — closest existing package shape to copy for
  `packages/payments` (plain `tsc`-built TS lib, no server, consumed only by
  `dba`). Note: its own Dashboard routes import `google-contacts` directly
  for a stateless OAuth-URL helper — explicitly NOT the pattern to follow
  for Payments (Input 2 requires `dba` as the only caller of
  `packages/payments`).
- `packages/dba/src/postgres.ts` — lazy env read for the Postgres pool
  (env not available at Next.js build-time page-data collection); same
  lazy-read shape used for Stripe config in `packages/payments/src/
  config.ts`.
- `packages/dba/sql/migrations/0003_lead_archives.sql` /
  `0004_referenced_files.sql` — migration-file convention followed for
  `0005_stripe_payments.sql` (repo_guid-scoped table, indexed, applied via
  `packages/dba/scripts/apply-postgres-migrations.mjs`).
- `packages/dashboard/lib/session.ts` — `getCurrentUserFromCookies()` is the
  only trusted source of the logged-in user/`repoGuid`; every Payments route
  (except the Stripe webhook itself, which authenticates via
  `Stripe-Signature` instead) calls this before touching `dba`.
- `human-docs/dashboard/settings/features/settings-page.md` — existing
  Settings feature doc (Theme card at top of layout + Password tab); updated
  by this Story since the Theme card moves into Display and stops being
  global.
- Existing Settings pages audited before touching anything: `display/`
  (dummy switches, not wired to `next-themes`), `appearance/` (empty stub,
  out of scope — not mentioned in the request), `notifications/` and
  `api-keys/` (dead template mockups, confirmed via grep: only referenced by
  the nav, `sitemap.ts`, and the unrelated `/dashboard/auth` template
  showcase page — safe to delete), `account/` (empty stub, out of scope),
  `password/` (real UI, backend intentionally `501` per its own feature doc
  — untouched), `read-only-folders/` (real, fetches live data — untouched).
- No Stripe code existed anywhere in the repo before this Story (confirmed
  via repo-wide grep) — this is a fresh implementation, not a continuation.
- `human-docs/dashboard/common/features/nginx-proxy-manager-domains.md` /
  `chad-domain-ssl.md` (Input 3) — `chad.biz.pl` → `chad-dashboard-prod`
  (`127.0.0.1:12030`) is a plain full-passthrough Nginx Proxy Manager
  reverse proxy, no path-based allow/block rules, so `/api/webhooks/stripe`
  needs no domain-specific routing config — only the app's own
  `middleware.ts` public-route exemption (already fixed) and PROD env/
  compose wiring (`docker-compose.qnap.prod.yml`, `.env.qnap`) mattered.
- `bash-scripts/dashboard/03_local_mac_docker/01_config.sh`/`03_re-start.sh`
  (Input 3) — `ENV_FILE="$REPO_ROOT/.env.local"`, passed to `docker compose`
  as `--env-file`; this is how a plain env-var addition to `.env.local`
  reaches the container without any image rebuild, and confirms
  `docker-compose.local.yml`'s `${STRIPE_SECRET_KEY:-}` substitution is
  resolved from this exact file.
