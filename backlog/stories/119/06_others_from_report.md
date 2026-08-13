# Story 119 — Other notes

## Pre-existing environment limitation (not caused by this Story)

`packages/dba/src/cp-link-resolver.test.ts` (this Story's new real-Postgres integration
test, added to `vitest.config.mjs`'s explicit `include` list next to the pre-existing
`postgres-cp-provider.test.ts`) requires real QNAP Tailscale Postgres credentials
(`POSTGRES_QNAP_PASSWORD`/`POSTGRES_PASSWORD`) that this sandboxed session does not have
network access to use. Confirmed this is an environment limitation, not a regression:
running the identical, unmodified, pre-existing `postgres-cp-provider.test.ts` — and the
official `pnpm test:integration:local-postgres` script — in this same session produces
the exact same credential error. `packages/dba/src/dev-db-override.ts` deliberately never
redirects Postgres's "server" source to an arbitrary local URI (its own code comment:
"Never silently redirect to a local mirror") — there is no supported local-only bypass.
The full `npx vitest run` for the whole monorepo shows the identical pattern across 21
test files (all Postgres/Mongo-QNAP-credential dependent), plus one unrelated real-data
Google Sheets reconciliation check (`reconcile-real-users.test.mjs`) that also needs live
QNAP/Sheets connectivity and is unrelated to Folders/Preview. Everything else — 702 tests
across 84 files, including this Story's own pure parser tests (7/7) and every existing
hdr1/hdr2/md/headers-format/text-editor-toolbar test — passed.

## Local Docker smoke

Ran the official `bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh` (build +
restart + status) twice — once after the initial implementation, once after fixing the
same-page CP-link navigation bug found during manual verification. Both builds succeeded;
the stack came up healthy both times. Two unrelated warnings appeared during the script's
own preflight/seed steps (a `pg` module-not-found in an ancillary sync script, and an
expected `ECONNREFUSED` reaching the real QNAP host from this sandbox) — both non-fatal,
both about infrastructure this Story didn't touch, and the dashboard container came up
and responded normally either way.

## Bug found and fixed during manual verification

The first working version of the CP-link click handler used `router.push` for
navigation. Clicking a CP-link rendered *inside Folders itself* only changed the URL —
Folders' own mount effect (intentionally read-once, since the page owns its own
Back/Forward nav state afterward) never re-ran, so the target item never actually
loaded. Switched to a hard `window.location.href` navigation, which is correct
regardless of which page (Folders or Knowledge) the link was clicked from. Caught by
testing the actual click end-to-end rather than only the parser/resolver in isolation.

## Not attempted / out of scope

No changes were made to `packages/net-content-provider`, Knowledge's slug-resolution
system, or any DB query path outside `packages/dba`/`packages/content-provider`. Clicking
a CP-link always opens the target in Folders (the general "view any CpItem by address"
screen, already reachable for anything in the same allowed repos including Knowledge's
own tree) rather than deep-linking into Knowledge's own slug-based URL scheme — no
id→slug resolver exists yet for Knowledge specifically, and building one was judged out
of scope for "the smallest correct mechanism" this Story's own instructions asked for.
