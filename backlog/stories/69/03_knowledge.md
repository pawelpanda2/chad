# Story 69 — Knowledge

## Etap 1 audit results (read-only, 2026-07-17)

Gathered via `bash-scripts/dashboard/06_qnap_test_ssh/05_status.sh` (existing,
sanctioned) plus ad-hoc `run_remote` calls (from `bash-scripts/common/lib.sh`)
for checks that had no existing dedicated script. Zero writes made.

**1. All chad-related containers:**

| Container | Image | Status | Ports |
|---|---|---|---|
| `chad-dashboard-test` | `chad-dashboard:260717_161100` | Up | `0.0.0.0:12020->3000` |
| `chad-dashboard-prod` | `chad-dashboard:260717_154135` | Up | `0.0.0.0:12030->3000` |
| `chad-mongodb` | `mongo:4.4` | Up (healthy) | `27017` (NOT published to host — internal `chad-shared` network only) |
| `chad-content-provider-api` | `chad-content-provider-api:260711_160839` | Up | `0.0.0.0:12024->12024` |

Full host container list also checked (`docker ps -a`, unfiltered) — only
two other containers exist on this QNAP, both unrelated: `npm` (Nginx
Proxy Manager) and `jellyfin`. No stray/duplicate Mongo instances.

**2. All MongoDB containers:** exactly one — `chad-mongodb` (`mongo:4.4`).
Note the version: **older than local's `mongo:7`** (`docker-compose.local.yml`).
Basic CRUD/index operations are compatible across this range, but worth
knowing before assuming 1:1 behavior parity (e.g. if any future work wants
newer aggregation operators).

**3. Ports:** dashboard TEST 12020, dashboard PROD 12030, content-provider-api
12024 — all host-published. Mongo itself is NOT host-published (no
`ports:` mapping in `docker-compose.qnap.shared.yml` for it) — only reachable
from inside the `chad-shared` Docker network, or via `docker exec` from the
QNAP host itself. This matters for Etap 3/7: reaching it "over Tailscale"
means Tailscale to the QNAP *host*, then something needs to either publish
27017 or run the migration/beeper-ws/beeper-sync process on the QNAP host
itself (or add a temporary/permanent port mapping) — **not yet resolved,
needs a decision before Etap 3/7 execute** (see `06_others_from_report.md`).

**4-6. Database name / collections / doc counts:** checked both `beeper`
and `chad` databases via `docker exec chad-mongodb mongo -u ... --eval
"db.getSiblingDB('beeper').getCollectionNames()..."` (note: `mongo:4.4`
ships the legacy `mongo` shell, not `mongosh` — confirmed by a failed
first attempt). **Both are completely empty** — `db.adminCommand({listDatabases:1})`
only shows the three MongoDB system databases (`admin`, `config`, `local`).
No `beeper` or `chad` database exists yet on QNAP. **Confirms: safe,
untouched target, no collision risk.**

**7. Mongo data volume:** bind mounts (not named Docker volumes), real
QNAP storage — `/share/CACHEDEV1_DATA/ContainerData/chad-shared/mongodb/{db,configdb}`,
plus `.../backups`. This is real disk, not the tmpfs class of bug recorded
in `qnap_container_data_on_tmpfs_bug.md` (memory) — confirmed correct.

**8. docker-compose files used:** `docker-compose.qnap.shared.yml` (Mongo +
content-provider-api, one shared instance for both TEST and PROD),
`docker-compose.qnap.test.yml` (dashboard TEST only),
`docker-compose.qnap.prod.yml` (dashboard PROD only, not touched by this
Story). **`docker-compose.qnap.test.yml`'s `dashboard` service has no
`MONGODB_URI` in its `environment:` block at all** — confirmed via `docker
exec chad-dashboard-test printenv | grep -i mongo` (empty). Same starting
gap Story 58 found and fixed locally. This is the Etap 6 work item.

**9-10. Images/tags:** many historical `chad-dashboard:<timestamp>` images
present (normal build history, not a risk). Currently running:
`chad-dashboard:260717_161100` (TEST), `chad-dashboard:260717_154135`
(PROD), `chad-content-provider-api:260711_160839`. Recorded tag files
(`.image-tag.chad-dashboard.env` etc.) on the QNAP checkout match the
running containers.

## Critical architectural fact surfaced during the audit

`docker-compose.qnap.test.yml`'s own header comment states outright: "TEST
is an alternative UI onto the SAME live data as PROD — not an
isolated/sandboxed environment. It talks to the SAME shared MongoDB
(chad-mongodb)... started by docker-compose.qnap.shared.yml." **There is
only one Mongo instance for both TEST and PROD.** Once Beeper data is
migrated into it, it exists for both environments at the data layer —
migrating to "QNAP TEST" is really "migrating to QNAP", full stop. What
stays TEST-only in this Story is the **dashboard wiring**: only
`docker-compose.qnap.test.yml`'s `dashboard` service gets `MONGODB_URI`
added (Etap 6); `docker-compose.qnap.prod.yml`'s `dashboard` service is
left exactly as-is (no `MONGODB_URI`), so `chad-dashboard-prod` remains
unable to read Beeper data even though the underlying database exists.
This satisfies the letter of "PROD pozostaje całkowicie nietknięte" for
the running software, but the user should know the *data* itself is
already QNAP-wide once Etap 4 applies — flagged for explicit confirmation,
see `06_others_from_report.md`.

## Git sync state

Remote QNAP checkout's `git rev-parse HEAD` = `5741776` (story-62 round
10) at audit time. Local HEAD = `7ef411f` (2 commits ahead: Story 59's
local-independence work + the `subscribeToBeeperChanges` SSE fix). QNAP
needs a `git pull` (already the first step of every `run_remote_script`
call) before any build there — the SSE fix and the migrator's
auto-index-creation improvement aren't live on QNAP until that pull +
rebuild happens.

## Reused tooling (per this repo's "read existing scripts, don't invent
new ones" convention)

- `bash-scripts/dashboard/06_qnap_test_ssh/05_status.sh` — read-only TEST
  status, already existed, used as-is for Etap 1.
- `bash-scripts/common/lib.sh`'s `load_qnap_ssh_config` + `run_remote` /
  `run_remote_script` — used directly for audit calls that had no
  dedicated script yet (shared-services status, Mongo queries). No new
  permanent scripts created for read-only one-offs.
- `bash-scripts/mongo/backup.sh` / `restore.sh` — already present on the
  QNAP checkout (confirmed in the audit) — Etap 2 will use these, not new
  ones.
- `bash-scripts/mongo/migrate-contacts-to-chad.mjs` — same script Story 59
  used locally, just pointed at a different target for Etap 3/4.
