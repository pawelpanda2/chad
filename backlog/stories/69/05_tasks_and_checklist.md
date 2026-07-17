# Story 69 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Etap 1 — Audit QNAP TEST environment (read-only) |
| 2 | NOT DONE  |             | Etap 2 — Backup QNAP Mongo |
| 3 | NOT DONE  |             | Etap 3 — Dry-run migration (Mac → QNAP TEST) |
| 4 | NOT DONE  |             | Etap 4 — Apply migration |
| 5 | NOT DONE  |             | Etap 5 — Confirm indexes |
| 6 | NOT DONE  |             | Etap 6 — Wire + verify Dashboard TEST |
| 7 | NOT DONE  |             | Etap 7 — Repoint Mac beeper-ws/beeper-sync at QNAP |
| 8 | NOT DONE  |             | Etap 8 — Live test (incremental sync, no force) |
| 9 | NOT DONE  |             | Etap 9 — Verify SSE on TEST |
| 10 | NOT DONE |             | Etap 11 — Final report |

(Etap 10 — "don't start beeper-oplog/replica-set" — is a boundary, not a
task; nothing to do or report beyond confirming it wasn't touched.)

# Task 1 — Audit QNAP TEST environment

**Requested:** Etap 1 — no changes, just show containers, Mongo instances,
ports, database name, collections, doc counts, data volume, compose files,
images, tags.

**Done:** Full read-only audit via existing/sanctioned tooling — see
`03_knowledge.md` for the complete findings table. Headline results:
target `beeper`/`chad` databases are **completely empty** (no collision
risk), only one Mongo instance exists on the host (`chad-mongodb`,
`mongo:4.4`), Mongo data is on real disk (not the tmpfs bug class), and
`docker-compose.qnap.test.yml`'s dashboard has **no `MONGODB_URI` wired in
at all** (same gap Story 58 found and fixed locally — this is Etap 6's
work).

**Found during the audit, not yet resolved — flagged for the user before
Etap 2 proceeds:**
1. **TEST and PROD share one Mongo instance** (confirmed by
   `docker-compose.qnap.test.yml`'s own header comment). Migrating Beeper
   data "to QNAP TEST" really means migrating it to QNAP, full stop, at
   the data layer — only the dashboard *software* wiring stays TEST-only
   (PROD's dashboard container gets no `MONGODB_URI`, so it can't read it
   even though the database exists).
2. **Mongo's port 27017 is not published to the host** — only reachable
   inside the `chad-shared` Docker network or via `docker exec` on the
   QNAP host. Etap 3 (migration target) and Etap 7 (Mac beeper-ws/sync
   "over Tailscale") both need this resolved first — see `04_todos.md`
   item 1 for the options.

**Files changed:** none — read-only.

**Tested:** every claim above was checked directly against the live QNAP
host (SSH), not assumed from documentation.

**Status: DONE**
