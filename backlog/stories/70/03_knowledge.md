# Story 70 — 03_knowledge.md

- `git remote -v` — real GitHub owner is `pawelpanda2` (repo
  `github.com/pawelpanda2/chad`), not `pawelfluder` as the input assumed.
  Used for the actual GHCR image path; flagged prominently rather than
  silently substituted.
- `packages/dashboard/Dockerfile` + `.dockerignore` — confirmed
  `packages/net-content-provider` (a git submodule) is excluded from the
  Docker build context and never referenced by the Dockerfile, so the new
  GitHub Actions workflow's checkout doesn't need `submodules: true`.
- `documentation/ai-docs/deploy/dashboard-deployment-scripts.md` and
  `image-tagging-standard.md` (Story 63/66/68) — the existing tag-record
  mechanism (`dashboard_image_tag_file`/`write_image_tag`/
  `require_image_tag`) is reused as-is; the registry flow only changes
  *who* writes to `.image-tag.chad-dashboard.env` and *how* the image gets
  onto the QNAP host, not the file/mechanism itself.
- `bash-scripts/dashboard/07_qnap_prod_ssh/06_last_from_test.sh` (Story 63)
  — re-read closely to confirm it would keep working unmodified once TEST
  starts getting its image via `docker pull` + local re-tag instead of a
  local build: since TEST and PROD run on the same QNAP host sharing one
  Docker image cache, and the re-tag produces the exact same bare
  `chad-dashboard:<tag>` name PROD's restart already expects, this holds.
  Not modified — `08_registry_prod/06_last_from_test.sh` is a separate,
  more rigorous (digest-based) successor, not a replacement.
- `.env.local.example`/`.env.qnap.example` — existing per-context env-file
  split (Mac vs QNAP) reused directly for GHCR push vs read tokens, rather
  than inventing a third `.env.ghcr` file.
