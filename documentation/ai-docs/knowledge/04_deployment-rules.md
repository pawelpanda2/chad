# Deployment rules (global, read before any build/start/stop/deploy task)

## The core rule

**Every build/start/stop/deploy operation goes through this repo's own
scripts — never a hand-typed `docker`/`docker compose`/`pnpm`/`dotnet`
command.** If a script exists for what you're about to do, use it. Do not
propose a "simpler" raw command as an alternative, even if it looks
equivalent — see "Why `docker-compose.yml` is not the source of truth"
below for exactly what a raw command silently skips.

Concretely, for the dashboard stack (`bash-scripts/dashboard/`), every
environment (`00_qnap_shared`, `02_local_mac_tmux`, `03_local_mac_docker`,
`04_qnap_test`, `05_qnap_prod`, `06_qnap_ssh`) exposes the same verbs:
`01_config.sh` (sourced by the rest, never run directly), `02_build.sh`,
`03_re-start.sh`, `04_end.sh`, `05_status.sh`, `06_deploy.sh` (= build +
re-start + status). Naming is **`re-start`/`end`** (until 2026-07-14:
`begin`/`end`), not `start`/`stop`, for the Docker-Compose family (root
`re-start.sh`/`end.sh`/`status.sh` wrap `02_local_mac_tmux` specifically and
use the same verbs) — see `deploy/dashboard-deployment-scripts.md` for the
full naming history, the 2026-07-14 `begin.sh`→`re-start.sh` rename (Story
54 correction), and the still-open exceptions (the tmux-only dev flow's own
internal `01_build.sh`/`02_start.sh` naming, and `06_qnap_ssh`'s
`begin_*.sh` wrappers, deliberately not renamed) — don't try to unify these
further in passing.

## Read before touching docker-compose

A `docker-compose.*.yml` file in this repo is **one component of a
deployment process, not the process itself.** Before reasoning about one,
read:
1. `deploy/dashboard-deployment-scripts.md` — the actual contract: what
   each script does, in what order, and why (shared/test/prod split,
   `container_name` vs service-name DNS across separate Compose projects,
   `require_shared_services_healthy` preflight, port ownership).
2. `deploy/image-tagging-standard.md` — how `IMAGE_TAG` really gets to a
   compose file (see below).
3. The actual `NN_*.sh` scripts for the environment in question — they are
   short and are the real source of truth, not a summary of them.

Never run `docker compose ... up/build/down` directly against one of these
files without going through its `03_re-start.sh`/`02_build.sh`/`04_end.sh` —
even when you think you know the equivalent flags, because the scripts do
things a bare compose invocation cannot:

- **`IMAGE_TAG` resolution.** Own images (`chad-dashboard`,
  `chad-content-provider-api`) never use `:latest`. The tag is a
  timestamp written to a gitignored `.image-tag.<image>.env` file **only
  after a successful build** (`write_image_tag`, last line of
  `02_build.sh`), and read back by `require_image_tag` in `03_re-start.sh` —
  no in-shell env var survives between separate script invocations, so a
  bare `docker compose up` without sourcing the same config will hit the
  compose file's `${IMAGE_TAG:?...}` required-var guard and fail (or, on
  an older compose file without that guard, silently fall back to a stale
  `:latest`, which is the exact incident that motivated this whole
  mechanism — see `image-tagging-standard.md`'s incident section). If you
  ever need to run compose commands directly (e.g. because only one
  service needs restarting and the full `03_re-start.sh` would also try to
  reclaim a port something else legitimately owns), still `source` the
  environment's own `01_config.sh` first and reuse its `IMAGE_TAG`/`ENV_FILE`/
  `COMPOSE_PROJECT_NAME`, don't invent your own.
- **Generated runtime config.** The Content Provider's `appsettings.json`
  is not baked into the image or checked into git — it's generated from a
  heredoc in `01_config.sh` by `write_content_provider_appsettings()` and
  written to `.runtime/<env>/content-provider/appsettings.json`
  immediately before `up`, then bind-mounted read-only. Skipping this step
  means the container starts with whatever stale file happens to be on
  disk (or none).
- **Health/readiness waits.** `03_re-start.sh` polls `/health` (Content
  Provider) and dashboard HTTP before declaring success, and — for
  `04_qnap_test`/`05_qnap_prod` — refuses to even attempt `up` unless
  `require_shared_services_healthy` passes first. A raw `docker compose up
  -d` returns immediately with no such guarantee.
- **Port-conflict handling.** `ensure_port_available` distinguishes "a
  Docker container from another compose project owns this port" (safely
  stopped/removed automatically) from "a non-Docker process owns this
  port" (refuses, prints the PID, does **not** kill it) — a bare compose
  command has neither check.
- **Ownership-scoped teardown.** `04_end.sh` is always
  `docker compose -p <project> down --remove-orphans`, never `-v`, never a
  broader `docker system prune`/`docker rm` sweep, and only ever touches
  its own project's resources (`00_qnap_shared`'s `end` explicitly warns
  it stops services shared by both TEST and PROD).

## Session-observed lesson (2026-07-14, Story 53 verification)

While driving a browser click-through for Story 53, the local
`chad-dashboard-local-mac-docker` container was intentionally
`docker stop`'d (not `rm`'d) to free port 12020 for a live `next dev`
session — and, unrelated to that command, the entire `local-mac-docker`
stack (dashboard + content-provider + mongo containers) later disappeared
from `docker ps -a` mid-session. Recovery was done by **sourcing
`bash-scripts/dashboard/03_local_mac_docker/01_config.sh`,
`bash-scripts/common/lib.sh`, and calling
`write_content_provider_appsettings()` before `docker compose up -d
content-provider-api`** — i.e., reusing the project's own config/appsettings
generation for the one service that needed restarting, rather than
inventing a fresh `docker run`/`docker compose` invocation from scratch or
guessing an `IMAGE_TAG`. The full `03_begin.sh` was not used as-is because
it also starts the `dashboard` service, which would have conflicted with
the already-running `next dev` process on the same port — a case of
"reuse the script's config, not the whole script," which is still
materially different from "write the docker command yourself."

## Summary for AI agents

- Before build/start/stop/deploy: find the matching `bash-scripts/.../NN_*.sh`
  and read it, plus the deploy doc for that environment. Don't start from
  `docker`/`docker compose`/`pnpm`/`dotnet` syntax you already know.
- `docker-compose.*.yml` tells you the shape of the stack (services, ports,
  volumes) — it does not tell you the process (tag resolution, generated
  config, health waits, ownership rules). Read the scripts and docs for
  that.
- If a script doesn't cover your exact case (e.g. restarting one service
  in isolation), reuse its config-loading (`01_config.sh`,
  `write_*` helpers, `lib.sh` functions) rather than writing a bare command
  from scratch.
- Never `docker compose down -v`, `docker system prune`, or kill
  containers/processes outside a script's own documented ownership
  tracking, without explicit user approval for that specific action.
