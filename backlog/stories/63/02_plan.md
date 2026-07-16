# Story 63 — Plan

**Status: audit + plan only, not approved for implementation.** Per Input 1
§12 and Input 2 §5: nothing in `bash-scripts/`, `documentation/`, or any
compose/config file has been touched yet. This document is the complete
presentation requested — audit, inconsistencies, `00_qnap_shared` verdict,
target tree, rename/move/delete list, reference-update list, test plan,
compendium location — in that order.

**Revised after Input 3** (all open questions from the first version of
this plan resolved by the user — see `01_input.md`, Input 3): no
`08_qnap_shared_ssh`, no `common_ssh/lib.sh` (SSH logic joins
`bash-scripts/common/lib.sh` instead, in its own clearly-marked section),
`04_end.sh` stays mandatory everywhere including both SSH directories, no
`07_logs.sh` anywhere for now (slot stays empty, nothing shifts),
`05_qnap_prod/{02_build,06_deploy}.sh` are deleted outright, and TEST's
build now records the git commit SHA as an OCI image label that
`06_last_from_test.sh` reads and displays. §4-§6 below reflect the final,
confirmed design — nothing in them is still an open option.

All findings below come from reading the actual current files on disk
today (not from documentation, not from memory of an earlier point in this
conversation — see `03_knowledge.md` for why that distinction matters here
specifically).

---

## 1. Audit — current state of `bash-scripts/dashboard/`

### `00_qnap_shared/` (6 files: `01_config`, `02_build`, `03_re-start`, `04_end`, `05_status`, `06_deploy`)

Runs the ONE shared MongoDB (`chad-mongodb`) + Content Provider API
(`chad-content-provider-api`) container pair used by **both**
`chad-dashboard-test` and `chad-dashboard-prod`. Already matches the new
numeric-slot shape exactly (`01`→`06`), just with `re-start` instead of
`restart`. No dead scripts. `06_deploy.sh` = `02_build.sh` →
`03_re-start.sh` → `05_status.sh`, no duplicated logic. No `07_logs.sh`
today (`docker compose logs` isn't wrapped anywhere in this repo yet, in
any environment).

### `02_local_mac_tmux/` (7 files, two both prefixed `01_`: `01_build.sh` +
`01_config.sh`, `02_start.sh`, `03_end.sh`, `04_status.sh`, `05_logs.sh`,
`tmuxinator.dashboard.yml`)

Non-Docker dev flow (tmux/tmuxinator: `dba` watch + `next dev` + Content
Provider run via plain `docker run`, not compose). `01_config.sh` is sourced
constants (slot 1, correct). `01_build.sh` is a **standalone production
build utility** (`pnpm --filter dba build` then `pnpm --filter dashboard
build`) — not sourced by anything, not part of the dev-session lifecycle,
genuinely a slot-2 "build an artifact" operation, just mis-numbered `01`
today (a real, if harmless, collision with `01_config.sh`). `02_start.sh` is
already restart-shaped: idempotent, stops via `03_end.sh` first if already
running, then starts fresh (see its own header comment, line 91-98) — this
**is** the `03_restart.sh` operation, just currently named `start`. `05_logs.sh`
dumps tmux pane scrollback — real, used, maps to slot 7. No slot-6 deploy
operation exists or is needed (tmux is dev-only, never a deploy target).

### `03_local_mac_docker/` (7 files: `01_port_kill`, `02_config`, `03_build`,
`04_re-start`, `05_end`, `06_status`, `07_deploy`)

Local Docker Compose stack (mongo + content-provider-api + dashboard, one
file, no test/prod split needed locally). This is the environment where the
real, git-tracked Story 54 added `01_port_kill.sh` as a thin CLI wrapper
around `kill_process_on_port()` (already lived in `bash-scripts/common/lib.sh`)
and wired it into `04_re-start.sh`'s preflight to auto-free required ports
instead of hard-failing. That insertion is exactly what pushed
`config`→`02`, `build`→`03`, `restart`→`04`, `end`→`05`, `status`→`06`,
`deploy`→`07` — one slot later than every other environment. Confirmed no
other script anywhere calls `01_port_kill.sh` directly except
`04_re-start.sh` itself (it's callable manually too, per its own header
comment, but nothing in the repo does so today).

### `04_qnap_test/` (6 files: `01_config`, `02_build`, `03_re-start`, `04_end`,
`05_status`, `06_deploy`)

Already matches the numeric contract exactly, `re-start` naming aside.
`03_re-start.sh` calls `require_shared_services_healthy` (from
`common/lib.sh`) before starting — refuses to start if `00_qnap_shared`
isn't up and healthy. `02_build.sh` builds `chad-dashboard` only. No dead
scripts, no `07_logs.sh`.

### `05_qnap_prod/` (6 files: `01_config`, `02_build`, `03_re-start`, `04_end`,
`05_status`, `06_deploy`)

Structurally **identical** to `04_qnap_test/` — same six operations, same
shape, including its own `02_build.sh` that can build a fresh
`chad-dashboard` image and its own `06_deploy.sh` (`02_build.sh` →
`03_re-start.sh` → `05_status.sh`). This is a real, flagged conflict — see
§2 below.

### `06_qnap_ssh/` (13 files: `lib.sh` + `{begin,end,deploy,status}_{shared,test,prod}.sh`)

Thin SSH wrappers: connect → `cd $QNAP_REPO_DIR && git pull --ff-only` →
run the real `NN_*.sh` script for that environment remotely. No deployment
logic duplicated anywhere — confirmed by reading every one of the 13 files
in full. `begin_*.sh` (not `NN_begin.sh` — a different naming pattern) were
deliberately left un-renamed by the real Story 54 (their internal targets
were updated to call `03_re-start.sh` remotely, but their own filenames
stayed `begin_*.sh`). No dead scripts. Confirmation gates: `SHARED`/`PROD`
require typing the word; `TEST` and read-only `status_*`/stop `end_*` don't.

### `packages/net-content-provider/03_scripts/qnap/*` (`begin_qnap_test.sh`,
`deploy_qnap_test.sh`, `lib.sh`, ...)

A **completely separate, older subsystem** — standalone Content Provider +
Blazor GUI, plain `docker run` (no Compose), documented in
`documentation/content-provider/next-tasks/qnap-test-deployment.md` as
explicitly distinct from everything above (`dashboard-deployment-scripts.md`
has its own section on this exact distinction). `packages/net-content-provider`
is separately known to be mid-rewrite. **Out of scope** — Input 1's own
audit list only names `bash-scripts/dashboard/`, and this legacy system
lives under `packages/`, not `bash-scripts/dashboard/`.

### Root wrappers: `re-start.sh`, `end.sh`, `status.sh`

Thin `exec` wrappers into `02_local_mac_tmux/`'s `02_start.sh`/`03_end.sh`/
`04_status.sh` respectively — so a user can `bash re-start.sh` from the repo
root. (Root `begin.sh` no longer exists — the real Story 54 renamed it to
`re-start.sh`.)

### `package.json` (repo root)

Only one bash-scripts-adjacent line: `"mongo:up": "docker compose -f
docker-compose.local.yml up -d mongodb"` — this bypasses
`03_local_mac_docker`'s own scripts entirely (a pre-existing, narrower
violation of `04_deployment-rules.md`'s "never a hand-typed docker compose
command" rule, unrelated to naming/numbering). No `begin`/`re-start`/`restart`
references in `package.json` at all — no changes needed there for this Story.

---

## 2. Inconsistencies found

1. **Three-way verb split, confirmed live in the repo today:** Docker-Compose
   family per-environment scripts use `re-start`/`end`; `06_qnap_ssh`
   wrappers use `begin_*`/`end_*`; `02_local_mac_tmux` uses `start`/`end`
   (its own `02_start.sh`, root `re-start.sh` wrapping it). Input 1 §2 wants
   all three unified on `restart` (no hyphen).
2. **`03_local_mac_docker`'s numbering is shifted by one** because
   `01_port_kill.sh` occupies slot 1. This is the exact problem Input 1 §5
   describes, confirmed present.
3. **`06_qnap_ssh`'s per-target files don't carry an operation-slot number
   at all** (`begin_test.sh`, not `03_..._test.sh`) — confirmed, matches
   Input 1 §6's description exactly.
4. **Real architecture conflict (Input 1 §8 asks to flag this explicitly):**
   `05_qnap_prod/02_build.sh` **exists and is fully capable of building a
   new `chad-dashboard` image independently of TEST.** Today, TEST and PROD
   happen to cooperate only because both `02_build.sh` scripts write/read
   the *same* shared, gitignored `.image-tag.chad-dashboard.env` file (see
   `image-tagging-standard.md`) — but nothing *prevents* someone from
   running `05_qnap_prod/02_build.sh` (or its SSH wrapper) directly, which
   would build and tag a "PROD-only" image never verified on TEST, silently
   satisfying `require_image_tag`'s check while violating the promotion
   model the user wants enforced. This is a real, current gap between the
   stated policy ("PROD nie powinien wykonywać niezależnego buildu") and
   what the code actually allows. **This Story's plan proposes closing it
   by removing PROD's ability to build at all** — see §4.
5. **`02_local_mac_tmux`'s own numbering collision** (`01_build.sh` +
   `01_config.sh` both at slot 1) — not mentioned explicitly in Input 1's
   text for this directory, but confirmed present and falls under the same
   global-slot fix.
6. **Minor pre-existing drift, unrelated to naming** (found while reading,
   noted for completeness, not proposed for action here unless the user
   wants it folded in): `package.json`'s `mongo:up` bypasses
   `03_local_mac_docker`'s own scripts; no `07_logs.sh` exists anywhere yet
   (a real, currently-unmet operational need — see the "Add `07_logs.sh`
   everywhere?" question below).

---

## 3. Verdict: `00_qnap_shared` — keep it

**Necessary, not dead, not redundant.** Evidence:

- **Who calls it:** `04_qnap_test/03_re-start.sh` and `05_qnap_prod/03_re-start.sh`
  both call `require_shared_services_healthy()` (in `bash-scripts/common/lib.sh`)
  before starting, which checks the `chad-shared` Docker network, `chad-mongodb`
  health, and `chad-content-provider-api`'s `/health` endpoint — all three
  only exist because `00_qnap_shared/03_re-start.sh` created them. Neither
  TEST nor PROD can start without it (confirmed: `require_shared_services_healthy`
  hard-fails and refuses to start if shared isn't already healthy).
- **Is sharing real, not just planned:** yes — `documentation/ai-docs/deploy/shared-qnap-services.md`
  records an actual, executed QNAP verification (2026-07-11): exactly 4
  `chad-*` containers running, `chad-mongodb` healthy, `chad-content-provider-api`
  `/health` → `repoCount:36`, both `chad-dashboard-test` and
  `chad-dashboard-prod` pointing at the identical `chad-content-provider-api`
  container and Mongo instance.
- **Why this exists at all:** before 2026-07-11, TEST and PROD each ran
  their *own* separate mongo + Content Provider — which didn't meet the
  actual business requirement (TEST is meant to be an alternate UI onto the
  **same real data** as PROD, not an isolated sandbox). `00_qnap_shared` is
  the direct fix for that, not incidental scaffolding.
- **Could the logic move elsewhere without duplication?** No clean way to:
  it's genuinely a third, independent Compose project (`-p chad-shared`,
  its own `docker-compose.qnap.shared.yml`), connected to TEST/PROD only via
  the external `chad-shared` Docker network — folding it into either
  `04_qnap_test/` or `05_qnap_prod/` would make one of them own
  infrastructure the other depends on, which is worse, not simpler.

**Conclusion: keep `00_qnap_shared/` as-is, structurally.** Only the
`re-start`→`restart` rename applies to it (§4/§5). Its own SSH control
surface is addressed as a new question below (§4, "shared" SSH directory).

---

## 4. Proposed target tree

### Global operation-slot contract (from Input 1 §2, applied everywhere below)

| Slot | Verb | Meaning |
|---|---|---|
| `01` | `config` | prepare/generate configuration (sourced, never run directly) |
| `02` | `build` | build an image or artifact |
| `03` | `restart` | start if down, restart if up, from an already-built artifact/image |
| `04` | `end` | stop the environment |
| `05` | `status` | show state + basic healthchecks |
| `06` | `deploy` | full deployment of a new version, per that environment's own contract |
| `07` | `logs` | view logs |

Gaps are intentional wherever an environment has no real use for a slot —
never filled just to look complete.

### `bash-scripts/dashboard/00_qnap_shared/`

```
00_qnap_shared/
├── 01_config.sh
├── 02_build.sh
├── 03_restart.sh      (renamed from 03_re-start.sh)
├── 04_end.sh
├── 05_status.sh
└── 06_deploy.sh
```

Slot `07` (logs) intentionally stays empty here — no existing implementation,
no confirmed need yet (Input 3 §5). Structure otherwise unchanged: this
directory is confirmed necessary (§3) and keeps running the shared
mongo + content-provider-api pair directly on the QNAP host; this Story
only renames `re-start`→`restart` and updates its docs, per Input 3 §1.

### `bash-scripts/dashboard/02_local_mac_tmux/`

```
02_local_mac_tmux/
├── 01_config.sh
├── 02_build.sh          (renamed from 01_build.sh)
├── 03_restart.sh        (renamed from 02_start.sh)
├── 04_end.sh             (renamed from 03_end.sh)
├── 05_status.sh          (renamed from 04_status.sh)
├── 07_logs.sh             (renamed from 05_logs.sh — resolved by Input 4)
└── tmuxinator.dashboard.yml
```

**Resolved by Input 4:** moving an already-existing `05_logs.sh` to its
correct standard slot (`07`) is a rename/numbering fix, not "adding a new
`07_logs.sh`" — Input 3 §5's rule was about not *creating* new logs
wrappers where none exist today, not about leaving an existing one
mis-numbered. `90_logs.sh` was explicitly rejected: `90`-range numbers are
reserved for non-standard technical tools (like `90_port-kill.sh`), and
logs is one of the seven standard operations. Slot `06` (deploy) stays
empty here — this tmux variant has no separate deploy operation.

### `bash-scripts/dashboard/03_local_mac_docker/`

```
03_local_mac_docker/
├── 01_config.sh          (renamed from 02_config.sh)
├── 02_build.sh            (renamed from 03_build.sh)
├── 03_restart.sh          (renamed from 04_re-start.sh)
├── 04_end.sh               (renamed from 05_end.sh)
├── 05_status.sh            (renamed from 06_status.sh)
├── 06_deploy.sh             (renamed from 07_deploy.sh)
└── 90_port-kill.sh            (renamed from 01_port_kill.sh — moved OUT of the operation-slot range; still a real, callable manual tool, still what 03_restart.sh calls internally, just no longer masquerading as slot "01")
```

Slot `07` intentionally empty (Input 3 §5) — no `07_logs.sh` added here
either.

### `bash-scripts/dashboard/04_qnap_test/`

```
04_qnap_test/
├── 01_config.sh
├── 02_build.sh          (now also writes the git-SHA OCI label — see below)
├── 03_restart.sh       (renamed from 03_re-start.sh)
├── 04_end.sh
├── 05_status.sh
└── 06_deploy.sh
```

Slot `07` intentionally empty (Input 3 §5).

### `bash-scripts/dashboard/05_qnap_prod/`

```
05_qnap_prod/
├── 01_config.sh
├── 03_restart.sh       (renamed from 03_re-start.sh)
├── 04_end.sh
└── 05_status.sh
```

**No `02_build.sh`, no `06_deploy.sh` — deleted outright, confirmed (Input 3
§6).** PROD never builds and never deploys independently; its only
deployment operation lives in `07_qnap_prod_ssh/06_last_from_test.sh`.
`01_config.sh` stays (still needed for `COMPOSE_PROJECT_NAME`/ports/etc.
sourced by the remaining three scripts). Slot `07` intentionally empty.

### SSH layer — replaces `06_qnap_ssh/` entirely (Input 2), no `08_qnap_shared_ssh` (Input 3 §2)

```
bash-scripts/dashboard/06_qnap_test_ssh/
├── 04_end.sh          → runs 04_qnap_test/04_end.sh remotely
├── 03_restart.sh    → runs 04_qnap_test/03_restart.sh remotely
├── 05_status.sh        → runs 04_qnap_test/05_status.sh remotely
└── 06_deploy.sh          → git preflight (local) → SSH → git pull → 04_qnap_test/06_deploy.sh remotely

bash-scripts/dashboard/07_qnap_prod_ssh/
├── 03_restart.sh    → runs 05_qnap_prod/03_restart.sh remotely (types PROD)
├── 04_end.sh          → runs 05_qnap_prod/04_end.sh remotely (no confirmation — stopping is always safe/reversible)
├── 05_status.sh        → runs 05_qnap_prod/05_status.sh remotely (no confirmation)
└── 06_last_from_test.sh  → the promotion script (see full contract below; types PROD)
```

Confirmed (Input 3 §4): `04_end.sh` stays mandatory at its fixed slot in
both directories — not dropped, never renumbered to `07`. No `lib.sh` in
either directory and no `08_qnap_shared_ssh/` at all (Input 3 §§2-3): every
script above sources `bash-scripts/common/lib.sh` directly — the same file
every other environment already sources — instead of a second, SSH-only
shared library. Slot `07` (logs) intentionally empty in both. No
`01_config.sh`/`02_build.sh` in either directory — config is `.env.qnap`
(read directly from `common/lib.sh`'s new SSH section, see below), and
build only ever happens as part of the remote `06_deploy.sh` call, never as
a separate SSH-triggered step (matches the existing, unchanged pattern —
there was never a `06_qnap_ssh/build_*.sh` either).

### `bash-scripts/common/lib.sh` — new SSH section (Input 3 §3)

Rather than a second library file, the SSH-specific functions currently
living in the old `06_qnap_ssh/lib.sh` (`read_env_value`/`get_config_value`
for `.env.qnap`, `run_remote`/`run_remote_script`, plus the new git
preflight functions from Input 1 §§2-5) move into
`bash-scripts/common/lib.sh` itself, under one clearly-marked new section
(e.g. a banner comment `# SSH / QNAP-remote-deploy helpers`), kept visually
and functionally separate from the port/Docker/image-tag helpers already in
that file — same file, not mixed responsibilities. `06_qnap_test_ssh/*.sh`
and `07_qnap_prod_ssh/*.sh` then just `source
"$REPO_ROOT/bash-scripts/common/lib.sh"` like every other script in the
repo already does, with no per-directory `lib.sh` at all.

### Git-SHA OCI label on the TEST build (Input 3 §7)

`04_qnap_test/02_build.sh` (the only remaining place `chad-dashboard` is
ever built, now that `05_qnap_prod/02_build.sh` is deleted) additionally:

1. Resolves `GIT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"` before the
   build.
2. Passes it through to `docker compose build` so the image gets the label
   `org.opencontainers.image.revision=<GIT_SHA>` — via that service's
   `build.labels:` entry in `docker-compose.qnap.test.yml` (reading
   `${GIT_SHA}` from the environment the same way `${IMAGE_TAG}` already
   is), not a bare `docker build --label` call, to stay inside the existing
   "always go through compose" rule.
3. This is a genuinely new mechanism (today's image carries no commit
   information at all, only the `IMAGE_TAG` timestamp) — not, as the first
   draft of this plan assumed, an unavoidable limitation.

### Contract for `07_qnap_prod_ssh/06_last_from_test.sh` (final, per Input 2 §3 + Input 3 §7)

1. SSH in, determine the image `chad-dashboard-test` is **currently
   running** (`docker inspect chad-dashboard-test --format '{{.Image}}'` —
   the actual running container's image ID, not just the tag file, since
   the tag file could theoretically have moved since TEST was last
   restarted) — resolve this on the QNAP host, not locally.
2. Also resolve PROD's **current** image the same way
   (`docker inspect chad-dashboard-prod --format '{{.Image}}'`, tolerating
   "not running yet") — needed for the required before/after comparison.
3. Read TEST's image tag, image ID, and its
   `org.opencontainers.image.revision` label (the git SHA from build time,
   per the section above).
4. Verify TEST's image exists locally on the QNAP host
   (`docker image inspect <id>`).
5. Print to the user, before asking for confirmation: TEST's tag, image ID,
   and git SHA; PROD's current image (what's about to be replaced).
6. Prompt for explicit confirmation (types `PROD`, consistent with every
   other PROD-touching operation in this repo).
7. Point PROD at that exact image: write `.image-tag.chad-dashboard.env`
   (the same canonical file `require_image_tag`/`05_qnap_prod/03_restart.sh`
   already read) to TEST's confirmed tag — a **write of the existing shared
   mechanism**, not a new one; the "promotion" that already happens
   implicitly today (via a shared tag file) becomes an explicit, verified,
   confirmed action instead.
8. Never runs `docker build`/`docker compose build`.
9. Run `05_qnap_prod/03_restart.sh` (restart/start PROD's dashboard
   container against the now-confirmed tag).
10. Run `05_qnap_prod/05_status.sh` for healthcheck/status.
11. Final confirmation step: `docker inspect chad-dashboard-test`/
    `chad-dashboard-prod` and assert identical `Image` (ID) — print
    success/failure explicitly, don't just assume it worked because the
    restart command returned 0.
12. If TEST's image can't be unambiguously determined (container not
    running, or `docker inspect` fails) → abort, don't guess. If the
    resolved image doesn't exist locally → abort with an error.

### Git preflight — where it lives now

Applies **only** to `06_qnap_test_ssh/06_deploy.sh` — the only operation
left anywhere in this repo that builds a new `chad-dashboard` image from
current source (confirmed by Input 3 §6 deleting `05_qnap_prod/02_build.sh`
and by there being no `08_qnap_shared_ssh` for the content-provider build,
per Input 3 §2). It does **not** apply to any `03_restart.sh`, and it does
not apply to `06_last_from_test.sh` (PROD never builds from source, so
"your local uncommitted changes won't be deployed" isn't a meaningful
warning for a pure image-promotion operation — what *would* be meaningful
there is exactly the before/after image display already built into its
contract above).

Checks (added to `bash-scripts/common/lib.sh`'s new SSH section, called
only by `06_qnap_test_ssh/06_deploy.sh`): repo root/branch/detached-HEAD,
`git status --porcelain`, upstream configured, ahead-count vs upstream, and
a remote-vs-local commit-hash comparison (one extra read-only SSH call) to
warn when deploying would redeploy an identical commit — full flow
(prompts, defaults, exact Polish wording) is unchanged from Input 1 §§2-5
and is not repeated in full here to avoid duplicating that spec; see
`03_knowledge.md` for the pointer back to it.

---

## 5. Rename / move / delete list

**Renamed (`git mv`):**
- `00_qnap_shared/03_re-start.sh` → `03_restart.sh`
- `02_local_mac_tmux/01_build.sh` → `02_build.sh`
- `02_local_mac_tmux/02_start.sh` → `03_restart.sh`
- `02_local_mac_tmux/03_end.sh` → `04_end.sh`
- `02_local_mac_tmux/04_status.sh` → `05_status.sh`
- `02_local_mac_tmux/05_logs.sh` → `07_logs.sh` (resolved by Input 4 — a
  numbering fix for an existing operation, not a new script)
- `03_local_mac_docker/02_config.sh` → `01_config.sh`
- `03_local_mac_docker/03_build.sh` → `02_build.sh`
- `03_local_mac_docker/04_re-start.sh` → `03_restart.sh`
- `03_local_mac_docker/05_end.sh` → `04_end.sh`
- `03_local_mac_docker/06_status.sh` → `05_status.sh`
- `03_local_mac_docker/07_deploy.sh` → `06_deploy.sh`
- `03_local_mac_docker/01_port_kill.sh` → `90_port-kill.sh`
- `04_qnap_test/03_re-start.sh` → `03_restart.sh`
- `05_qnap_prod/03_re-start.sh` → `03_restart.sh`
- root `re-start.sh` → `restart.sh`

**Deleted (capability removal, confirmed — Input 3 §6):**
- `05_qnap_prod/02_build.sh`
- `05_qnap_prod/06_deploy.sh`

**Deleted (replaced by the new SSH layer):**
- `06_qnap_ssh/` (all 13 files, including `lib.sh`) — replaced by
  `06_qnap_test_ssh/`, `07_qnap_prod_ssh/`, and the SSH functions merged
  into `bash-scripts/common/lib.sh`. No `08_qnap_shared_ssh` (Input 3 §2).

**New files:**
- `06_qnap_test_ssh/{03_restart,04_end,05_status,06_deploy}.sh`
- `07_qnap_prod_ssh/{03_restart,04_end,05_status,06_last_from_test}.sh`

**Edited, not renamed:**
- `bash-scripts/common/lib.sh` — gains the new SSH section (moved in from
  the old `06_qnap_ssh/lib.sh`, plus the new git-preflight functions), and
  its existing `re-start`/`03_re-start.sh` references become
  `restart`/`03_restart.sh`.
- `04_qnap_test/02_build.sh` — adds `GIT_SHA` resolution + the OCI label.
- `docker-compose.qnap.test.yml` — adds the dashboard service's
  `build.labels:` entry for `org.opencontainers.image.revision`.

**Not touched:** `packages/net-content-provider/03_scripts/qnap/*` (separate
subsystem, out of scope), `package.json` (no relevant references),
`bash-scripts/beeper/*` (separate subsystem — its `02_re-start.sh` naming
is a decision the real Story 54 already made for that package; this Story
is scoped to `bash-scripts/dashboard/` only, per Input 1's own audit list),
`00_qnap_shared/{01_config,02_build,04_end,05_status,06_deploy}.sh` (no
content changes beyond the one `03_restart.sh` rename and reference fixes —
Input 3 §1 confirmed keep, naming/docs only).

---

## 6. References to update

Every one of the following was confirmed (by reading, not assuming) to
contain a real, live reference to one of the renamed/removed paths above —
not a blind repo-wide find-and-replace:

- **Internal cross-references inside the renamed scripts themselves**:
  `source`/`bash "$SCRIPT_DIR/..."` lines, comments naming a sibling script
  by its old filename (every environment's own `06_deploy.sh`/`07_deploy.sh`
  chain, `02_start.sh`'s call to `03_end.sh`, `90_port-kill.sh`'s caller in
  the new `03_restart.sh`, root `restart.sh`'s `exec` target).
- **`bash-scripts/common/lib.sh`**: `require_shared_services_healthy()`'s
  fix-it `log_error` hints (currently `.../00_qnap_shared/03_re-start.sh`),
  and the prose comments mentioning `re-start`/`begin` in the release-tag
  section.
- **`docker-compose.local.yml`, `docker-compose.qnap.{shared,test,prod}.yml`**:
  comments referencing old script names (already confirmed present from the
  real Story 54's own report of what it touched there).
- **`.gitignore`**: one comment (`# read by 03_re-start.sh`) → `03_restart.sh`.
- **`.env.qnap.example`**: comment references, if any (to be verified per
  Input 1's "check meaning before changing" rule during implementation, not
  assumed here).
- **`bash-scripts/content-provider/run-content-provider-if-needed.sh`**: its
  `--wait-only` usage-comment referencing "begin.sh" — this is about the
  **root-level tmux wrapper**, which itself is being renamed
  `re-start.sh`→`restart.sh` in this Story, so this comment needs updating
  too (it was already stale relative to the real Story 54's rename; this
  Story is the first one to actually touch this file for that reason).
- **`documentation/ai-docs/deploy/dashboard-deployment-scripts.md`**: the
  single largest edit — full rewrite of its numbering table and its
  "Niespójność nazewnictwa" section (currently describing a 3-way
  `re-start`/`begin_*`/`start` split; becomes a description of one unified
  `restart` verb, the new SSH-directory split, and the `00_qnap_shared`
  verdict) — this is the doc Input 1 §9 asks to be corrected into "an
  authoritative, current source of truth."
- **`documentation/ai-docs/deploy/shared-qnap-services.md`**: deploy/
  promotion/rollback command examples (`begin_prod.sh` etc.) and its whole
  §6 "Procedura promocji obrazu TEST → PROD" (currently describing a manual
  retag; becomes a description of `06_last_from_test.sh`).
- **`documentation/ai-docs/deploy/image-tagging-standard.md`**: multiple
  `begin_*.sh`/`03_re-start.sh` references throughout its promotion-procedure
  walkthrough.
- **`documentation/ai-docs/deploy/qnap-data-path.md`**: two references
  (`begin_shared.sh`, `00_qnap_shared/03_re-start.sh`/soon `03_restart.sh`).
- **`documentation/ai-docs/deploy/dashboard-start-scripts.md`**: the
  `re-start.sh`→ references for the *tmux* family specifically (this doc's
  own subject) need updating to `restart.sh`, including its own recorded
  test log (`bash begin.sh` lines — those are frozen historical test output
  from 2026-07-10, predating even the real Story 54's rename; per this
  Story's own precedent elsewhere, dated historical test transcripts are
  left as-is, not rewritten to match a naming scheme that didn't exist yet
  at the time they were recorded — flagged as a judgment call, not silently
  assumed).
- **`documentation/ai-docs/begin_here/02_what-and-where.md`** and
  **`04_deployment-rules.md`**: both mention `re-start`/`06_qnap_ssh`/
  `begin_*` in their "Deploy" sections and naming-history paragraphs.
- **`documentation/ai-docs/deploy/bash-scripts-structure.md`**: left
  untouched — already flagged inside itself, twice now (once in the real
  Story 54, again per this plan), as partially outdated and kept
  deliberately as a historical naming-rationale record, not a living doc.

Full line-by-line list will be produced fresh at implementation time via
grep for each specific old path (not enumerated exhaustively here, since
some exact hits depend on the order operations are actually carried out
in) — consistent with Input 1 §3's "check meaning before changing, no
blind global replace" instruction, which this Story's own audit already
demonstrated by excluding e.g. `bash-scripts/beeper/*` and
`packages/net-content-provider/*`'s superficially-similar `begin`/`re-start`
hits.

---

## 7. Test plan

1. `bash -n` on every touched/renamed `.sh` file (syntax only).
2. `shellcheck` on the same set, if available on this machine (to be
   checked at implementation time — not confirmed available yet).
3. Repo-wide grep for `begin`, `re-start`, and each old numeric filename
   after the rename — zero live hits expected outside deliberately-excluded
   historical/out-of-scope files (enumerated in §6 above).
4. Every SSH wrapper (`06_qnap_test_ssh/*`, `07_qnap_prod_ssh/*`,
   `08_qnap_shared_ssh/*` if approved) points at a script that actually
   exists after the rename — checked programmatically, not just by eye.
5. Run each renamed script from a directory other than the repo root (e.g.
   `/tmp`) to confirm `SCRIPT_DIR`/`REPO_ROOT` resolution still works
   (existing scripts already do this correctly; renaming shouldn't change
   it, but it's cheap to re-verify).
6. Real, local `status` test: run `03_local_mac_docker/05_status.sh` (once
   renamed) against the actually-running local stack.
7. Real, local `restart` test — both scenarios required by Input 2 §6:
   - stopped → restart: `04_end.sh` then `03_restart.sh`, confirm it starts
     cleanly.
   - already running → restart: `03_restart.sh` again while up, confirm the
     existing idempotent stop-then-start path still works (this exact path
     is already covered by the real Story 54's own testing — re-run once
     under the new filename to confirm the rename didn't silently break it,
     same approach that Story took for its own rename).
8. `deploy TEST` (`06_qnap_test_ssh/06_deploy.sh`, once built) exercises the
   real chain end-to-end **only with explicit go-ahead**, since it's a real
   SSH action against the shared QNAP host — not run automatically as part
   of "testing the plan."
9. Analysis (not a live PROD run, per Input 1 §10's explicit "don't deploy
   to PROD automatically") that `06_last_from_test.sh` never invokes
   `docker build`/`docker compose build` anywhere in its own source, and
   that `05_qnap_prod/` no longer contains a `02_build.sh` to fall back to.
10. `find bash-scripts/dashboard -type f | sort` compared directly against
    the tree documented in the corrected `dashboard-deployment-scripts.md`,
    confirming they match exactly (this is the literal check Input 1 §10
    asks for: "potwierdzenie, że dokumentowane drzewo zgadza się z wynikiem
    `tree`").

None of the above have been run yet — this is the plan for testing once
the rename/restructure itself is approved and implemented, not a report of
tests already performed.

---

## 8. Compendium — planned location

`documentation/ai-docs/bash-scripts-standard-compendium.md` (proposed;
final placement per Input 1 §11's own instruction to "match the current
documentation convention" — reasoning: it's a portable methodology
document, not CHAD domain knowledge or a CHAD deploy-ops doc, so it sits
better alongside `documentation/ai-docs/feature-documentation-rules.md`
— another "standard the AI must follow," not tied to one project — than
inside `documentation/ai-docs/deploy/`, which is specifically CHAD's own
deploy documentation). Would be indexed from
`documentation/ai-docs/begin_here/02_what-and-where.md`'s existing
"Standardy dla AI (meta)" section. **Not written yet** — Input 1 §11 is
explicit that it only gets written after the CHAD-side fix is implemented
and verified, so this Story's current output is only the location
proposal, not the file itself.

---

## Open questions

**None remaining.** Input 3 and Input 4 resolved every open point from the
first draft of this plan, including the one narrow follow-up question
(`02_local_mac_tmux/05_logs.sh`'s new slot, settled as `07_logs.sh`). The
target tree, rename/move/delete list, and reference-update list in this
document are the final design — ready for implementation once explicitly
approved.
