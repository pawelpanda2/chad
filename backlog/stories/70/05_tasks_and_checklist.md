# Story 70 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | `chad-dashboard` build removed from QNAP entirely — structurally (no `build:` in compose) and procedurally (old scripts refuse to run) |
| 2 | DONE      |             | New `08_registry_test` deploys TEST via GHCR (build+push local/CI, pull+restart on QNAP), reusing existing restart/status/healthcheck logic unchanged |
| 3 | DONE      |             | New `09_registry_prod` promotes PROD to TEST's exact image via GHCR, by digest, with explicit confirmation and before/after verification |
| 4 | NOT DONE  |             | Real, end-to-end run of the new flow against the actual GHCR/QNAP (build+push+pull+restart; PROD promotion) |

# Task 1 — QNAP build removal

**Done:** `docker-compose.qnap.test.yml`'s `build:` section removed
(mirrors PROD's Story 63 treatment). `04_qnap_test/02_build.sh`,
`04_qnap_test/06_deploy.sh`, and `06_qnap_test_ssh/06_deploy.sh` rewritten
as scripts that print a clear error and exit 1, pointing at
`08_registry_test/`, instead of building. `03_restart.sh`/`04_end.sh`/
`05_status.sh` in both directories left completely untouched (per explicit
mid-task instruction: don't touch scripts that already worked correctly —
these never built anything).

**Tested:** static grep across every QNAP-facing script
(`04_qnap_test`, `06_qnap_test_ssh`, `08_registry_test`, `09_registry_prod`)
for `docker build`/`docker compose build`/`pnpm install`/`next build` —
zero matches. `docker compose config` against the edited
`docker-compose.qnap.test.yml` (and `.prod.yml`, unchanged) — both valid.

**Status:** DONE.

# Task 2 — TEST via GHCR

**Done:** `bash-scripts/common/lib.sh` gained a GHCR section
(`ghcr_image_ref`, `ghcr_docker_login`, `ghcr_generate_tag`,
`ghcr_build_tag_push`, `ghcr_pull_and_retag`). `08_registry_test/`:
`01_config.sh` (constants), `02_build.sh` (local build+push, writes the
existing `.image-tag.chad-dashboard.env`), `03_restart.sh` (SSH: login +
pull + local retag + calls the **unmodified**
`04_qnap_test/03_restart.sh`, which already does the shared-services
healthcheck, port handling, and HTTP wait), `04_end.sh`/`05_status.sh`
(thin passthroughs), `06_deploy.sh` (git preflight + build → restart →
status, the new primary entry point). `.env.local.example` gained
`GHCR_PUSH_USERNAME`/`GHCR_PUSH_TOKEN`. `.github/workflows/
build-dashboard-image.yml` added: `workflow_dispatch` only, least-privilege
`permissions:`, uses `GITHUB_TOKEN` (no PAT), reuses `ghcr_generate_tag`
for the tag format (not a second implementation).

**Tested:** `bash -n` on every new/changed script — pass. `ghcr_generate_tag`
produces the expected `<YYMMDD_HHMMSS>-<7-char-sha>` format (verified
against a regex). `ghcr_docker_login` correctly refuses with a clear error
on a missing/placeholder token (tested both cases). `ghcr_pull_and_retag`
correctly fails cleanly (exit 1, clear message, no crash) against a
deliberately nonexistent GHCR image/tag. Grepped the whole diff for token
variables — every occurrence is a function-call argument (which itself
uses `--password-stdin`, never echoes), never a raw print. GitHub Actions
workflow YAML validated with a YAML parser. **Not run for real** — an
actual build+push to GHCR and pull+restart on the real QNAP is a real
external action (creates a real package, touches the real TEST
environment) beyond "implement the plan," and needs the real GHCR tokens
to be created first (see the end-of-turn report).

**Status:** DONE (implementation + everything testable without live
credentials/network); live run pending Task 4.

# Task 3 — PROD promotion via GHCR

**Done:** `09_registry_prod/`: `01_config.sh` (same constants),
`03_restart.sh`/`04_end.sh`/`05_status.sh` (thin passthroughs to
**unmodified** `05_qnap_prod/*.sh`, mirroring `07_qnap_prod_ssh` exactly),
`06_last_from_test.sh` (reads TEST's running image tag/digest/git-SHA,
shows it plus PROD's current image, requires typing `PROD`, pulls TEST's
exact image from GHCR by digest, re-tags locally to TEST's own tag string,
restarts PROD via the existing `05_qnap_prod/03_restart.sh`, checks status,
then separately re-checks shared services and TEST are still healthy, then
confirms TEST/PROD end up on the identical image ID). No
`02_build.sh`/`06_deploy.sh` in `09_registry_prod` — confirmed by directory
listing, PROD still never builds.

**Tested:** `bash -n` passes. Confirmed by inspection that
`07_qnap_prod_ssh/06_last_from_test.sh` (Story 63, untouched) keeps working
unmodified under the new flow, since the local Docker image cache is
shared between TEST and PROD on the same host and the re-tag step
preserves the bare `chad-dashboard:<tag>` name it depends on (reasoned
through in `03_knowledge.md`, not independently re-tested live). **Not run
against the real QNAP** — see Task 4; explicitly not attempted per the
input's own "Nie wykonuj deploymentu PROD bez mojej osobnej zgody."

**Status:** DONE (implementation); live run pending Task 4, and PROD
specifically pending separate explicit approval regardless.

# Task 4 — Real end-to-end run

**Not done.** Requires: real GHCR tokens created (push + read, see the
end-of-turn report for exact instructions) and placed in `.env.local`/
`.env.qnap`, then an actual `08_registry_test/06_deploy.sh` run (builds a
real image, pushes a real GHCR package, pulls it onto the real QNAP,
restarts the real TEST container). None of this was done automatically —
it's a real external action (creates a durable GHCR package, changes what
TEST is running) beyond what "implement and test the plan" covers on its
own, and the input explicitly withholds approval for any PROD deployment
regardless. Asked about separately at the end of this turn.

**Status:** NOT DONE — blocked on user-created tokens + explicit go-ahead,
not on missing code.
