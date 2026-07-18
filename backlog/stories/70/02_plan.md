# Story 70 — Plan

## Key finding before implementing: GHCR image name

The input suggests `ghcr.io/pawelfluder/...`, but `git remote -v` shows this
repo actually lives at `git@github.com:pawelpanda2/chad.git` — the real
owner is **`pawelpanda2`**, not `pawelfluder`. GHCR packages are namespaced
under the GitHub account/org that owns them; pushing under a different
username than the actual repo owner would either fail (no permission) or
create a package under the wrong account. Per the input's own instruction
("Nie zgaduj końcowej nazwy obrazu, jeżeli repo ma już standard"), this
Story uses the real owner: **`ghcr.io/pawelpanda2/chad-dashboard`** (image
name `chad-dashboard` matches the existing local image name used
everywhere already — `docker-compose.qnap.test.yml`'s `image:
chad-dashboard:${IMAGE_TAG}`, `dashboard_image_tag_file()`, etc.). Flagged
prominently in the final report, not silently substituted.

## Architecture decision: local re-tag, not a compose `image:` rewrite

`docker-compose.qnap.test.yml` currently references the bare local name
`chad-dashboard:${IMAGE_TAG}` (no registry prefix). Rather than rewriting
that to the full GHCR path (which would ripple into `04_qnap_test`'s
`03_restart.sh`/`05_status.sh`/`require_image_tag` and PROD's identical
pattern), the new registry flow does:

```
docker pull ghcr.io/pawelpanda2/chad-dashboard:<tag>
docker tag  ghcr.io/pawelpanda2/chad-dashboard:<tag>  chad-dashboard:<tag>
```

...then calls the **existing, unchanged** `04_qnap_test/03_restart.sh`,
which already does `docker compose up -d` against `chad-dashboard:${IMAGE_TAG}`
— now satisfied by the just-pulled-and-retagged local image. This means
zero changes to `04_qnap_test/{01_config,03_restart,04_end,05_status}.sh`,
zero changes to either compose file's `image:` field, and — since TEST and
PROD run on the **same physical QNAP host** sharing one Docker image
cache — `07_qnap_prod_ssh/06_last_from_test.sh` (Story 63) continues to
work completely unchanged too (it already just reads whatever
`chad-dashboard-test` is running and re-points PROD's tag file at it).
`09_registry_prod`'s new promotion script goes further per this Story's
explicit ask (pull by digest from GHCR directly, not just trust the shared
local cache) — see below.

## What must stop building on QNAP

Confirmed via `bash-scripts/dashboard/04_qnap_test/`: `02_build.sh` (builds
`chad-dashboard` via `docker compose build`) and `06_deploy.sh` (calls
`02_build.sh` → `03_restart.sh` → `05_status.sh`) are the only two scripts
capable of an expensive local build. `06_qnap_test_ssh/06_deploy.sh` is the
only SSH-callable path that triggers `04_qnap_test/06_deploy.sh` remotely.
All three are turned into clearly-labeled stubs that refuse to run and
point at the new registry flow, per the input's explicit "muszą kierować
do nowego mechanizmu GHCR i wyraźnie informować, że build na QNAP został
wyłączony." `03_restart.sh`/`04_end.sh`/`05_status.sh` (in both
`04_qnap_test` and `06_qnap_test_ssh`) never built anything — left
untouched, and reused by the new flow via the existing
`run_remote_script`-style pattern.

## New folders

- `08_registry_test/` — `01_config.sh` (GHCR registry/image constants,
  non-secret), `02_build.sh` (build locally + tag with git SHA[+timestamp]
  + push to GHCR — runs on whatever machine invokes it, never on QNAP),
  `03_restart.sh` (SSH: login if needed, pull, retag locally, record tag,
  call `04_qnap_test/03_restart.sh` remotely), `04_end.sh`/`05_status.sh`
  (thin SSH passthroughs to the existing `04_qnap_test` scripts, same
  pattern `06_qnap_test_ssh` already uses), `06_deploy.sh` (orchestrates:
  git preflight → `02_build.sh` → `03_restart.sh` → `05_status.sh` — the
  new primary entry point, replacing `06_qnap_test_ssh/06_deploy.sh`'s
  role). No `07_logs.sh` — `04_qnap_test` has none to wrap.
- `09_registry_prod/` — `01_config.sh`, `03_restart.sh`/`04_end.sh`/
  `05_status.sh` (thin SSH passthroughs to `05_qnap_prod`, mirroring
  `07_qnap_prod_ssh`), `06_last_from_test.sh` (the promotion operation —
  reads TEST's current tag/digest/git-SHA, pulls that exact image from
  GHCR **by digest** on the QNAP host, shows before/after, requires typing
  `PROD`, restarts, verifies). No `02_build.sh`/`06_deploy.sh` — PROD never
  builds.

## Shared logic → `bash-scripts/common/lib.sh`

New GHCR section: `ghcr_docker_login` (via `--password-stdin`, never
echoing the token), `ghcr_build_tag_push` (build, tag `<timestamp>-<git-sha-short>`,
push, capture digest), `ghcr_pull_and_retag`, `ghcr_image_ref`. Used by
both `08_registry_test` and `09_registry_prod` — not duplicated.

## Secrets

New vars, added to the *existing* env files (not a new file):
- `.env.local.example` (Mac-side, used by `08_registry_test/02_build.sh`):
  `GHCR_REGISTRY`, `GHCR_OWNER`, `GHCR_IMAGE`, `GHCR_PUSH_USERNAME`,
  `GHCR_PUSH_TOKEN` (PAT, `write:packages` only).
- `.env.qnap.example` (QNAP-side, used by `08_registry_test/03_restart.sh`
  and `09_registry_prod/06_last_from_test.sh`, over SSH): `GHCR_REGISTRY`,
  `GHCR_OWNER`, `GHCR_IMAGE`, `GHCR_READ_USERNAME`, `GHCR_READ_TOKEN` (PAT,
  `read:packages` only).

GitHub Actions: uses the automatic `GITHUB_TOKEN` (scoped to `packages:
write` via the workflow's own `permissions:` block) — no PAT needed there
at all.

## GitHub Actions

No existing workflow found (`.github/` doesn't exist). New minimal
`workflow_dispatch`-only workflow (never on every push, per the input) that
builds, tags with git SHA, sets the OCI revision label, pushes, prints the
digest. Delegates to the same tagging convention as the local path (not a
second implementation of "what the tag looks like").

## Testing plan

`bash -n`/shellcheck on all new/changed scripts; a local, no-network dry
run of the tag-format function; grep the whole diff for anything that looks
like a token/secret; static check that no `docker build`/`docker compose
build` string remains reachable in the QNAP-facing scripts (`04_qnap_test`,
`06_qnap_test_ssh`, `08_registry_test`, `09_registry_prod`) outside the
explicitly-stubbed, refusing-to-run compatibility scripts; `docker compose
config` against the edited `docker-compose.qnap.test.yml`. No deploy is run
— building/pushing a real image and pulling it onto the real QNAP is a real
action beyond "implement the plan," asked about separately at the end.
