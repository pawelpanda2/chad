# Story 70 — Others (decisions, problems, limitations, proposals)

## Correction (Input 2): reverted the non-additive changes

The first implementation pass disabled the QNAP-side build capability
(`04_qnap_test/{02_build,06_deploy}.sh`, `06_qnap_test_ssh/06_deploy.sh`
rewritten into refusing stubs; `docker-compose.qnap.test.yml`'s `build:`
section removed) instead of leaving it alone and adding GHCR purely as a
parallel option. The user caught this and asked for a full revert of those
four files plus a recheck of every other file touched. Done via
`git restore --staged --worktree` against `HEAD` for exactly those four
files (confirmed byte-identical to `HEAD` afterward), and a documentation
pass to remove every "disabled"/"replaced" framing that depended on the
reverted behavior, reframing Story 70 throughout as strictly additive: old
QNAP-build path unchanged and still fully valid, GHCR path new and
optional, invoked only via `08_registry_test/06_deploy.sh` /
`09_registry_prod/06_last_from_test.sh`.

`.env.local.example`/`.env.qnap.example` (new vars only) and
`bash-scripts/common/lib.sh` (pure append, verified via `git diff` showing
only additions with zero removed/modified lines, `@@ -761,3 +761,161 @@`)
were kept as-is — they satisfy the same additive standard applied to the
four reverted files, just via addition rather than needing a revert.

## Decisions made

- **GHCR owner corrected from `pawelfluder` to `pawelpanda2`** — the input
  suggested the former, but `git remote -v` shows the repo's real owner is
  the latter. Used the real owner throughout (env files, `01_config.sh`
  files, the workflow, all documentation) and flagged this prominently
  rather than silently going with the input's example.
- **Non-secret GHCR constants (`GHCR_REGISTRY`/`GHCR_OWNER`/`GHCR_IMAGE`)
  live in each environment's own `01_config.sh`, not in the `.env` files**
  — matches the existing pattern (ports, compose project names) of
  "non-secret constants in `01_config.sh`, only real secrets in `.env`."
  An earlier draft put them in the `.env` files too, alongside the tokens;
  corrected before finishing, to avoid two sources of truth for the same
  three values.
- **Local re-tag to the bare `chad-dashboard:<tag>` name**, instead of
  rewriting either compose file's `image:` field to the full GHCR path —
  keeps `04_qnap_test/03_restart.sh` and `05_qnap_prod/03_restart.sh`
  (and both compose files' `image:` fields) completely unchanged. This is
  the single decision that made "reuse existing restart/status, don't
  duplicate" straightforward instead of requiring changes to four more
  files.
- **`09_registry_prod/06_last_from_test.sh` pulls by digest, but writes
  TEST's own tag string (not a digest-derived one) into
  `.image-tag.chad-dashboard.env`** — satisfies the input's explicit "pull
  by digest" requirement (rigor) while keeping the tag-record file's
  content meaningful/consistent with what TEST itself recorded (rather
  than introducing a second, digest-derived tag naming scheme).
- **Did not touch `07_qnap_prod_ssh/06_last_from_test.sh`** — reasoned
  through (not re-tested live) that it keeps working unmodified given the
  shared-local-cache fact; kept both it and `09_registry_prod`'s version
  side by side rather than merging or deleting either, per the input's own
  "nie usuwaj od razu... najpierw sprawdź zależności."
- **GitHub Actions workflow is `workflow_dispatch`-only** — no existing
  workflow was found to extend (`.github/` didn't exist at all), and the
  input explicitly asked not to trigger on every push unless the existing
  standard already did (it doesn't — this repo's whole deploy philosophy,
  documented since Story 63, is "deliberate action, not automatic
  triggers").
- **No `submodules: true` in the GitHub Actions checkout** — confirmed
  `packages/net-content-provider` (a real git submodule) is excluded via
  `.dockerignore` and never referenced by `packages/dashboard/Dockerfile`,
  so it isn't needed for this specific build. Checked directly rather than
  assumed either way.

## Problems encountered

- None blocking. The main risk area (getting the GHCR pull to satisfy the
  existing compose files without touching them) was resolved by the
  local-retag decision above, verified by static reasoning about Docker's
  own tag-vs-image-ID model rather than a live test (no real GHCR access
  in this session).

## Not done / left undone

- **No real build, push, pull, or restart was executed** — everything
  above is implemented and tested to the extent possible without real
  GHCR credentials and without touching the real, shared QNAP host
  (Task 4). This includes not creating the two GitHub PATs this Story's
  own documentation instructs the user to create.
- **PROD promotion was not run** — explicitly withheld per the input's own
  instruction, independent of Task 4's blocker.
- **`shellcheck` was not available on this machine** — `bash -n` used as
  the fallback the input itself allowed ("shellcheck lub aktualny
  repozytoryjny odpowiednik").

## Proposals

- Once real tokens exist: run `08_registry_test/06_deploy.sh` for real once
  to validate the whole chain end-to-end, before relying on it for regular
  use.
- Consider, in a future Story, whether `07_qnap_prod_ssh/06_last_from_test.sh`
  should eventually be retired in favor of `09_registry_prod`'s version
  now that a GHCR-native path exists — not decided here, per "don't remove
  old paths immediately."
- The `03_local_mac_docker` environment still builds `chad-dashboard`
  locally via plain `docker compose build` (unrelated to QNAP, out of
  scope for this Story, which is specifically about QNAP no longer
  building) — left untouched, correctly, since local dev builds were never
  part of the problem this Story solves.
