# Story 63 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | `deploy` for QNAP TEST warns clearly about uncommitted local changes and unpushed commits before connecting over SSH, instead of silently deploying stale code |
| 2 | DONE      |             | `bash-scripts/dashboard/03_local_mac_docker` — `restart` works both when the stack is stopped and when it's already running (idempotent), under the new `01_config...06_deploy` naming |
| 3 | DONE      |             | QNAP TEST can be restarted/status-checked via SSH under the new `06_qnap_test_ssh` scripts, confirmed running the already-built image |
| 4 | DONE      |             | QNAP PROD can no longer build or deploy independently of TEST — the capability is removed, not just discouraged |
| 5 | PARTIAL   |             | QNAP PROD can be promoted to TEST's exact image via `07_qnap_prod_ssh/06_last_from_test.sh` (built and code-reviewed; **not yet run against the real QNAP PROD** — needs separate explicit go-ahead, see below) |

# Task 1 — Git preflight before TEST deploy

**Requested:** (`01_input.md`, Input 1 §§2-5, reconfirmed in Input 5/6 after
the user hit exactly this bug in real use) — before connecting over SSH,
`deploy` for TEST must check for uncommitted changes and unpushed commits,
warn clearly, and give the user a chance to commit/push or abort, instead of
silently deploying whatever is already on the QNAP checkout.

**Done:**
- New `git_deploy_preflight()` in `bash-scripts/common/lib.sh` (new "SSH /
  QNAP-remote-deploy helpers" section): checks repo root/branch/detached
  HEAD/upstream, `git status --porcelain` (prints `git status --short`,
  warns, asks to commit — default N, aborts on decline; commits via
  separate `git add -A` + `git commit -m`, never `-am`), ahead-count vs
  upstream (asks to push — default Y, plain `git push`, never `--force`),
  and a no-new-commits check (compares local `HEAD` against the QNAP host's
  actual checked-out commit via one extra read-only SSH call,
  `remote_repo_head()`).
- `--non-interactive` flag parsed by `06_qnap_test_ssh/06_deploy.sh`: dirty
  tree and unpushed commits become hard errors instead of prompts; the
  no-new-commits check logs and continues (not listed as an error case in
  the spec, and blocking an intentional automated redeploy of the same
  commit isn't the bug this exists to prevent).
- Wired into `06_qnap_test_ssh/06_deploy.sh` only — not into any
  `03_restart.sh`, not into `06_last_from_test.sh` (neither builds from
  local source, so "your uncommitted changes won't be deployed" isn't a
  meaningful warning there).

**Files changed:** `bash-scripts/common/lib.sh`,
`bash-scripts/dashboard/06_qnap_test_ssh/06_deploy.sh`.

**Tested:** Code review of the full preflight flow against the original
spec (Input 1 §§2-5) — matches the required prompts/defaults exactly. **Not
exercised end-to-end with a real dirty/ahead working tree against the real
QNAP** (would have required deliberately leaving this session's own commits
uncommitted, which conflicts with actually finishing the Story) — this is
flagged, not claimed as tested beyond code review. `bash -n` passes.

**Status:** DONE (the mechanism exists and is wired correctly; full
interactive-prompt runtime exercise is the one thing not directly observed).

# Task 2 — Local Docker restart, both scenarios

**Requested:** (`01_input.md`, Input 2 §6) — test both `restart` when the
environment is down and when it's already running.

**Done:** Renamed `03_local_mac_docker`'s six files onto the standard slots
(`01_config`...`06_deploy`) plus `90_port-kill.sh` (moved out of the
operation-slot range — a manual/automatic technical tool, not one of the
seven standard operations).

**Tested (real, local, against the actually-running stack):**
- **Already running → restart:** ran `03_restart.sh` against the live
  `chad-local` stack. Output: idempotent stop via `04_end.sh` → ports freed
  via `90_port-kill.sh` (12020/12024/27017, each confirmed free) →
  `docker compose up -d` → `content-provider-api` healthy
  (`repoCount:38, anyRepoFound:true`) → `chad-local stack is up`.
- **Stopped → start:** ran `04_end.sh` (confirmed via `docker ps` — zero
  `chad-*` containers), then ran `03_restart.sh` **from `/tmp`** (not the
  repo root, to also confirm `SCRIPT_DIR`/`REPO_ROOT` resolution survives
  being invoked from elsewhere) — clean start, same health confirmation.
- `05_status.sh` (renamed from `06_status.sh`) run directly — correct
  `docker compose ps` + both healthchecks.

**Files changed:** all 7 files in `03_local_mac_docker/` (6 renamed +
content fixes, 1 renamed to `90_port-kill.sh`).

**Status:** DONE.

# Task 3 — QNAP TEST restart/status via SSH under new naming

**Requested:** (`01_input.md`, Input 6) — after the user hit
`bash: .../04_qnap_test/03_re-start.sh: No such file or directory` running a
real deploy (build succeeded, restart step failed on a stale internal
reference left over from an incomplete rename), fix every remaining active
reference to the old names, then verify against the real QNAP: restart,
status, healthcheck, confirm the exact image tag running.

**Done:**
- Root cause: `04_qnap_test/06_deploy.sh`'s own call to its sibling restart
  script still said `03_re-start.sh` after the file itself had already been
  renamed to `03_restart.sh` earlier in this same session's edit sequence —
  an incomplete rename pass, exactly as diagnosed in the input.
- Ran a repo-wide grep for `03_re-start.sh`/`04_re-start.sh`/`begin_*.sh`/
  `re-start` across `bash-scripts/` and `documentation/` and fixed every
  live hit found (see `06_others_from_report.md` for the full list — this
  also caught unrelated latent bugs: `03_local_mac_docker/{04_end,05_status}.sh`
  still sourced the pre-rename `02_config.sh`, and `00_qnap_shared/02_build.sh`
  still referenced the now-deleted `06_qnap_ssh/deploy_shared.sh`).
- Built `06_qnap_test_ssh/{03_restart,04_end,05_status,06_deploy}.sh` to
  replace the deleted `06_qnap_ssh/begin_test.sh`/`deploy_test.sh`/etc.

**Tested (real, against the actual QNAP host, s12/100.117.139.83):**
- `bash bash-scripts/dashboard/06_qnap_test_ssh/03_restart.sh` — real SSH
  connection, `git pull --ff-only` (`Already up to date`), remote
  `04_qnap_test/03_restart.sh` ran successfully: stopped the already-running
  `chad-dashboard-test` cleanly, restarted it, dashboard responded.
- `bash bash-scripts/dashboard/06_qnap_test_ssh/05_status.sh` — confirmed
  `chad-dashboard-test` running image **`chad-dashboard:260717_010442`**
  (the exact tag the user's build had produced), `Up`, dashboard responding
  on port 12020 — matches the input's explicit request to confirm this
  exact tag.
- No rebuild was performed for this verification, per the input's explicit
  "nie buduj ponownie obrazu, jeżeli nie jest to konieczne."

**Files changed:** see Task 1's list plus every file enumerated in
`02_plan.md` §5/§6 and `06_others_from_report.md`.

**Status:** DONE.

# Task 4 — PROD cannot build or deploy independently

**Requested:** (`01_input.md`, Input 1 §8, Input 3 §6) — PROD must never
build its own image or deploy independently; only promote TEST's already-
verified image.

**Done:**
- Deleted `05_qnap_prod/02_build.sh` and `06_deploy.sh` outright (`git rm`).
- Removed the `build:` section entirely from `docker-compose.qnap.prod.yml`
  (a judgment call beyond the literal ask, per Input 5's "podejmij
  rozsądną decyzję... opisz ją później w raporcie" — see
  `06_others_from_report.md`): this makes an independent PROD build
  structurally impossible (no build context configured), not merely
  undocumented/discouraged.
- `04_qnap_test/02_build.sh` is now the only place `chad-dashboard` is ever
  built, and additionally records the building commit's SHA as a standard
  OCI label (`org.opencontainers.image.revision`) on the image, via a new
  `build.labels:` entry in `docker-compose.qnap.test.yml` (Input 3 §7).

**Tested:** Confirmed by inspection — `ls bash-scripts/dashboard/05_qnap_prod/`
shows only `01_config.sh`/`03_restart.sh`/`04_end.sh`/`05_status.sh`;
`docker-compose.qnap.prod.yml` has no `build:` key. Not tested by actually
attempting a `docker compose build` against that file and observing the
failure (would require a real QNAP session solely to prove a negative;
the missing `build:` key is definitive on its own).

**Status:** DONE.

# Task 5 — PROD promotion via `06_last_from_test.sh`

**Requested:** (Input 2 §§1-4) — a new operation that determines TEST's
exact running image (tag, image ID, git SHA), shows it plus PROD's current
image, asks for explicit confirmation, points PROD at that exact image
(never building), restarts PROD, and confirms both environments end up on
the identical image ID.

**Done:** `bash-scripts/dashboard/07_qnap_prod_ssh/06_last_from_test.sh`
implements the full contract from `02_plan.md` (final version, incorporating
the git-SHA label from Input 3 §7): remote inspection of both containers'
current images in one SSH call, abort-not-guess if TEST's image can't be
determined or doesn't exist, display tag/image ID/git SHA/PROD's current
image, `Type PROD` confirmation, atomic write of
`.image-tag.chad-dashboard.env` to TEST's confirmed tag, `05_qnap_prod/03_restart.sh`
→ `05_status.sh`, final `docker inspect` comparison printed explicitly as
success/failure.

**Tested:** `bash -n` passes. Reviewed against the contract line-by-line.
**Not run against the real QNAP PROD** — promoting to production is a
separate, real action beyond what "implement the approved plan" authorizes
on its own; this needs an explicit go-ahead, asked for separately (see the
end of this turn's chat message).

**Status:** PARTIAL — code complete and reviewed, real-world execution
pending explicit approval.
