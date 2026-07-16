# Portable `bash-scripts` deployment standard — compendium

Status: derived from CHAD's own `bash-scripts/dashboard/` structure after it
was corrected, tested, and documented in Story 63
(`backlog/stories/63/`) — not a theoretical standard written in the
abstract. See `documentation/ai-docs/deploy/dashboard-deployment-scripts.md`
for the live, worked example this compendium generalizes from.

**Purpose:** hand this single file to an AI agent working in a *different*
repository that wants a similar, disciplined `bash-scripts/` deployment
layer. It teaches a method — audit first, apply fixed operation slots,
build a shared library, gate deploys with a Git preflight, separate
build-capable environments from promotion-only ones — not a fixed folder
name to copy blindly.

**This document does not replace reading the actual target repo.** An
agent using this must still do its own audit (§1) before proposing
anything.

---

## 0. What is mandatory vs. optional vs. CHAD-specific

- **Mandatory (the actual standard):** the seven-slot numbering contract
  (§3), the gap rule, one shared library file, the restart-vs-deploy
  distinction, a Git preflight on any operation that builds from local
  source and pushes it somewhere remote, never running raw
  `docker`/`docker compose` commands when a script exists for the same
  operation.
- **Optional, decide per-project:** whether you need a TEST/PROD split at
  all (a single-environment project doesn't); whether you need SSH
  wrappers at all (a project with no remote host doesn't); the exact CLI
  tool used for password-based SSH (`sshpass`/`expect`); whether a
  `90_*`-numbered escape hatch for manual tools is needed.
- **CHAD-specific, do not copy verbatim:** directory names
  (`00_qnap_shared`, `04_qnap_test`, ...), container names, ports, the
  Mongo/Content-Provider-specific health checks, `.env.qnap` variable
  names, the exact `git_deploy_preflight` Polish-language prompts (translate/
  reword for the target project's own language and tone).
- **A decision the target repo must make itself, not inherit from CHAD:**
  which environment(s) are allowed to build vs. which are promotion-only —
  this depends on that project's own release process, not on this document.

---

## 1. Audit checklist (do this first, always)

Before proposing any structure:

1. `find <bash-scripts-root> -type f | sort` — the real current tree. Do
   not trust any existing documentation's directory diagrams; compare them
   against this output and flag mismatches.
2. For every existing script: what operation does it actually perform
   (read the code, not just the filename)? Is it called by anything else
   (`grep` for its filename across the repo)? Is it dead?
3. Every *active* cross-reference to a script you might rename: other
   scripts' `source`/`bash "$SCRIPT_DIR/..."` calls, comments that are
   copy-pasteable commands (not just prose), CI config, `package.json`
   scripts, Docker Compose files, `.gitignore`, example env files,
   documentation. Grep for the literal filename, read every hit, and
   classify each as "live command a user/script would actually run" vs.
   "prose/historical record describing a past state" — only fix the
   former; dated historical/incident records should stay as they were
   (see §9).
4. Recognize environments/roles present in *this* project — don't assume
   CHAD's shape (shared-services / test / prod / local-docker / local-native
   / SSH-remote). A project might have only one or two of these, or a
   different split entirely (e.g. staging + prod, no shared-services
   layer at all).
5. For each environment, note what it actually needs: does it build? Does
   it deploy independently, or only ever run something built elsewhere?
   This determines which slots (§3) it gets and which SSH-remote contract
   it needs (§7).

---

## 2. Constant sloppiness patterns to specifically check for

These are the concrete problems CHAD's own audit found — check for the
same shapes elsewhere:

- **A numbering collision from adding a new script without a plan** (a new
  manual/technical script taking slot `01` and pushing everything else down
  by one). Fix: give it a number *outside* the operation-slot range instead
  of shifting the rest (§3, "gaps and out-of-range numbers").
- **A verb that changed names over time but only partially** (e.g.
  `begin`→`re-start`→`restart` across several corrections) leaving some
  callers pointing at an intermediate name. Fix: one final repo-wide grep
  for every historical name, right before declaring the rename done — not
  just the name you started from.
- **A "shared" build path that isn't actually exclusive** — two
  environments that are each independently *capable* of producing the
  artifact that's supposed to only ever come from one canonical place
  (e.g. both a TEST and a PROD environment having their own `build`
  script, "cooperating" only by accident because they happen to write to
  the same tag file). Fix: remove the capability from the
  non-canonical environment entirely (delete the script *and* the
  build-context configuration, e.g. Docker Compose's `build:` key) —
  don't just document that it shouldn't be used.
- **A deploy operation with no safety check that the code it's about to
  ship is what the developer actually thinks it is** — the single most
  concrete failure mode this whole document exists to prevent (§8).

---

## 3. The seven operation slots

| Slot | Verb | Meaning |
|---|---|---|
| `01` | `config` | prepare/generate configuration; sourced by the rest, never run directly |
| `02` | `build` | build an image or artifact |
| `03` | `restart` | start if down, restart if up, from an already-built artifact/image — never builds |
| `04` | `end` | stop the environment |
| `05` | `status` | show state + basic healthchecks; never changes state |
| `06` | `deploy` | full deployment of a new version, per that environment's own contract (typically `build`→`restart`→`status`) |
| `07` | `logs` | view logs |

**Naming: `restart`, never `begin`/`start`/`re-start`.** Pick one verb and
apply it project-wide; CHAD went through three names before landing here —
don't repeat that churn by leaving an old name half-migrated.

### Gaps are mandatory, not optional

If an environment has no real use for a slot, that number is simply absent
from its directory — never filled just to "complete" the set, and never
used to renumber the remaining files. A promotion-only environment (no
`build`, no independent `deploy`) has 4 files, not 7 with 3 stubs.

### Out-of-range numbers for non-standard tools

A script that is a real, useful, manually-invokable technical tool but
isn't one of the seven operations above (e.g. a port-freeing helper) gets a
number *outside* `01`-`07` — CHAD uses `9x` (`90_port-kill.sh`) — so it can
never collide with a future standard slot and never shifts the numbering of
real operations.

### Per-environment "no `NN`" is itself information

An environment directory missing `02_build`/`06_deploy` is documenting, by
its own file listing, "this environment never builds/deploys
independently" — make that a readable fact (`ls` the directory), not
something buried in prose.

---

## 4. Directory shapes to consider (not a template to copy blindly)

Decide per-project which of these roles actually exist before creating any
directory:

- **Local native/dev (no containers)** — if the project has a non-Docker
  local dev flow (tmux, foreground processes, etc.), it gets the same slot
  numbers, with `restart` meaning "start the dev session if not running,
  restart if it is," and typically no `06_deploy` slot at all (dev flows
  aren't deploy targets).
- **Local Docker (single combined stack)** — if local dev *does* use
  Docker, and there's no need to split shared/test/prod locally, one
  directory with all services in one Compose file is enough.
- **Remote environments that build** — at least one environment must be
  the canonical place a new version is actually built and verified before
  going further (CHAD: TEST).
- **Remote environments that only promote** — any environment downstream
  of that one (CHAD: PROD) gets `restart`/`end`/`status` only, plus a
  dedicated promotion operation instead of its own `build`/`deploy` (§7).
- **A shared-infrastructure environment** — if two or more remote
  environments need to share one piece of infrastructure (a database, a
  common backend service) rather than each running their own copy, that's
  its own directory/Compose project, connected via an external network —
  not folded into either dependent environment (whichever one "owned" it
  would create an asymmetric dependency the other doesn't have on it).
  Whether this needs its own SSH-remote wrapper directory is a judgment
  call, not automatic — CHAD deliberately does not have one, managing it
  directly over SSH instead, because the cost of a rarely-used remote
  wrapper wasn't worth it for that project. Decide based on how often this
  layer actually needs remote redeployment.
- **SSH-remote control layer** — see §7.

---

## 5. `common/lib.sh` pattern

One shared library file per logical concern, sourced by every script that
needs it — never copy-pasted per directory, never a second competing
library "just for SSH" or "just for one environment family." Organize by
clearly commented sections (banner comments), not by splitting into
multiple files, unless the file genuinely grows unmanageable.

Minimum useful functions to include, generalized from CHAD's own (see
`bash-scripts/common/lib.sh` for the real implementation of all of these):

- `log_info`/`log_ok`/`log_warn`/`log_error` — consistent, colorized (only
  when a TTY) output.
- `require_command`/`require_file` — fail fast with an actionable fix-it
  message, not a bare error.
- Port/process helpers: check if a port is in use, identify what's using
  it (Docker container vs. plain process — check Docker *first*, since
  `lsof`-style checks can misreport a container-published port depending
  on platform), free it safely (targeted `docker stop`/`kill`, never a
  broad `system prune`/`pkill`/`killall`).
- Release-tag helpers: write a tag only after a build actually succeeds,
  read it back with no silent fallback to a floating tag like `:latest`,
  and a separate "read-only" variant for status/stop operations that don't
  need the tag to be valid (they never run the image).
- A minimal `.env`-style key=value file parser, reused everywhere a script
  needs to read host-specific config — don't write it twice.
- If there's a shared-infrastructure environment (§4): a
  `require_<shared>_healthy` preflight function that dependent environments
  call before starting, and which never tries to fix/start the shared
  layer itself — only reads state and fails loudly with a pointer to the
  right fix-it command.

---

## 6. Script header pattern

Every script:

```bash
#!/usr/bin/env bash
set -euo pipefail   # or set -Eeuo pipefail if you also want ERR traps

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
source "$REPO_ROOT/bash-scripts/common/lib.sh"
source "$SCRIPT_DIR/01_config.sh"   # if this environment has one
```

This resolves the repo root from the script's own on-disk location via
`git`, never from `$PWD` — every script must work correctly when invoked
from any directory, including from outside the repo entirely
(`bash /full/path/to/script.sh`). Test this explicitly (§10) — don't assume
it from the pattern alone.

---

## 7. SSH-remote layer

If (and only if) the project has environments on a remote host managed
over SSH:

- **One directory per environment that has a genuinely different deploy
  contract**, not one directory per "location." CHAD splits
  `06_qnap_test_ssh`/`07_qnap_prod_ssh` because TEST builds and PROD only
  promotes — those are different contracts, not just different target
  hosts. If two remote environments have the *identical* contract, one
  directory parameterized by target may be simpler; don't split
  reflexively.
- Each SSH directory exposes the *same* slot numbers as thin remote
  wrappers: connect → (for build-capable environments only) run a local
  Git preflight (§8) → SSH → `git pull --ff-only` on the remote checkout →
  run the real environment script remotely → done. **Never duplicate the
  environment script's own logic in the SSH wrapper** — the wrapper's only
  job is transport (SSH, host/credentials from a single `.env`-style
  config) plus, for deploy operations, the preflight.
- **A build-capable environment's `06_deploy.sh`** does the real build +
  restart + status remotely, gated by the Git preflight.
- **A promotion-only environment has no `02_build`/`06_deploy` at all** —
  instead, a dedicated promotion operation (CHAD: `06_last_from_test.sh`,
  keeping deploy's slot `06` since it's still "the deployment operation for
  this environment," just under a name that says what it actually does).
  Contract for that operation:
  1. Determine the upstream environment's **currently running** artifact
     (not just a recorded tag file, in case of drift) — abort, don't guess,
     if this can't be determined unambiguously or the artifact doesn't
     exist.
  2. Also read the downstream environment's current artifact, for a
     before/after comparison.
  3. Show the user exactly what's about to be promoted (version identifier,
     and a source-code identifier if you have one — see the OCI-label
     pattern below) plus what it's replacing.
  4. Require explicit confirmation (a typed keyword matching the
     environment name, e.g. "PROD", not just a bare y/N — the blast radius
     justifies the extra friction).
  5. Point the downstream environment at that exact artifact (this is
     usually just re-writing the same shared tag-record file the upstream
     environment already wrote — an explicit, confirmed version of
     something that may already happen implicitly via a shared file).
  6. Never build.
  7. Restart the downstream environment, check its status.
  8. Confirm afterward, explicitly, that both environments now reference
     the identical artifact — print success/failure, don't assume a
     nonzero-free run means it worked.
- **Recording a source-code identifier on the built artifact** (e.g. a
  Docker image OCI label `org.opencontainers.image.revision` set to the
  building commit's SHA) makes the promotion operation's confirmation step
  meaningful to a human, not just a tag string. Wire this at build time,
  read it back at promotion time.
- If a "shared infrastructure" environment (§4) exists, whether it needs
  its own SSH-remote directory is a judgment call (see §4) — don't assume
  it does by symmetry with the other environments.

---

## 8. Git preflight for any deploy that builds from local source

Applies **only** to the operation that actually builds a new artifact from
whatever is on the local machine/checkout right now — never to a plain
restart (nothing local is being shipped) and never to a promotion operation
(it ships something already built elsewhere, not local source).

Checks, in order, before any remote connection is made:
1. Confirm you're in a real repo, on a real branch (abort on detached
   HEAD — there's no branch to push from) with a configured upstream
   (abort if none — can't reason about ahead/behind without one).
2. `git status --porcelain` — if dirty: show the short status, warn
   clearly that these changes will NOT be deployed, then either hard-fail
   (non-interactive mode) or ask whether to commit now (default: no;
   decline aborts the deploy). If accepted: ask for a commit message,
   `git add -A` then `git commit -m "<message>"` as **two separate
   commands**, never a combined shortcut — either failing aborts.
3. Ahead-of-upstream count — if greater than zero: either hard-fail
   (non-interactive) or ask whether to push (default: yes; plain
   `git push`, **never** `--force`; declining while still ahead should
   abort, not silently continue, since that reproduces the exact bug this
   whole mechanism exists to prevent).
4. No-new-commits detection — compare local `HEAD` against what's actually
   checked out on the remote host right now (one extra, read-only remote
   call; comparing commit hashes directly is more robust than trying to
   parse a `git pull`'s human-readable output). If identical: warn that
   this deploy will most likely ship an identical version, and either ask
   to continue anyway (default: no) or, in non-interactive mode, log and
   continue (this is information, not a failure condition — a deliberate
   automated re-deploy of the same commit is legitimate).
5. Support a `--non-interactive` flag from the start of this mechanism's
   life, even before anything actually needs unattended runs: dirty tree
   and unpushed commits become hard errors, zero prompts. Keep this
   separate from any environment-specific "type the environment name to
   confirm" gate (e.g. promotion to production) — non-interactive mode for
   the git-safety checks doesn't have to imply bypassing a separate,
   deliberate production safety gate; treat that as its own decision.

Implement this once, in the shared library (§5), called only by the
environments that actually build from local source.

---

## 9. Historical records vs. living documentation

When correcting documentation as part of a rename/reorg, distinguish two
kinds of content:

- **Living contract descriptions** ("here's what `03_restart.sh` currently
  does") — update these to match the current, real state. Never leave a
  "drzewo"/tree diagram or command example that doesn't match `find`'s
  actual output.
- **Dated historical/incident records** ("on 2026-07-13 we hit X, here's
  exactly what command fixed it") — leave these referencing the names that
  were actually in use *at the time the incident happened*. Rewriting a
  frozen incident record to use today's names misrepresents what was
  actually run — add a forward-pointer note instead ("this script is now
  named X") if the connection isn't otherwise obvious.

Move superseded rationale into a dedicated "Historia zmian"/"Changelog"
section at the end of the living doc rather than scattering "outdated, see
below" caveats throughout — a document that's mostly corrective footnotes
on top of older text stops being a usable source of truth.

---

## 10. Testing checklist

- `bash -n` on every touched/new script (syntax only) — cheap, do this
  first, on everything.
- `shellcheck` on the same set, if available.
- A fresh repo-wide grep for every old name/number being retired, right
  before declaring a rename complete — not just where you remembered to
  look. Classify every hit per §9 before deciding whether it needs fixing.
- Confirm every SSH/thin-wrapper script points at a target file that
  actually exists post-rename — check this programmatically, not by eye.
- Run at least one renamed script from a directory other than the repo
  root (and, if relevant, from outside the repo entirely) to confirm path
  resolution (§6) wasn't broken by the rename.
- Real (not just code-reviewed) `status` test against an actually-running
  environment.
- Real `restart` test in **both** directions: environment currently down →
  restart brings it up cleanly; environment currently up → restart is
  idempotent (stops cleanly, restarts, ends healthy) — both are required,
  neither implies the other.
- Real `deploy` test for the build-capable environment, end-to-end — but
  only with explicit go-ahead if it touches a real, possibly shared,
  remote host.
- For a promotion-only environment: verify by inspection that it has no
  way to build (no build script, no build-context configuration left in
  its compose/equivalent file) — this is a structural check, not something
  you need a live run to prove.
- Never claim a scenario was "tested" if only `bash -n`, a code review, or
  a build/typecheck was actually performed — say exactly what ran and what
  didn't (this is a documentation-honesty rule, not a testing-technique
  rule, but it matters just as much).

---

## 11. Anti-patterns (don't do these)

- Filling an empty numbering gap "for consistency" without a real,
  currently-existing implementation behind it.
- Shifting existing numbers to make room for a new script instead of
  giving the new script an out-of-range number.
- Leaving a capability that violates your own stated architecture rule
  (e.g. "downstream never builds") merely undocumented instead of removed.
- A second, competing shared library "just for one family of scripts" —
  one library, organized into sections, per project.
- Any bare `docker`/`docker compose` command run manually "just this once"
  where a script already exists for the same operation — the script does
  things (tag resolution, generated config, health waits, port-conflict
  handling, ownership-scoped teardown) a raw command silently skips.
- Rewriting a dated historical incident record to use current names.
- Declaring a rename "done" without a final, fresh repo-wide grep for
  every old name it's replacing.
- Assuming environments in a new project must mirror an example project's
  shape (shared/test/prod, SSH split, etc.) rather than deriving the real
  shape from that project's own audit (§1).

---

## 12. Checklists (condensed, for quick reference during work)

**Audit checklist:** real current tree via `find`, not documentation → what
does each script actually do (read code, check callers) → grep every active
cross-reference before renaming anything → identify this project's actual
environment roles, don't assume CHAD's.

**Implementation checklist:** apply the seven-slot contract with mandatory
gaps → out-of-range numbers for non-standard tools → one shared library,
sectioned → restart never builds → only one environment builds/deploys
per artifact, everything downstream promotes → Git preflight on the one
build-and-deploy operation only → historical records untouched, living
docs rewritten.

**Testing checklist:** `bash -n` + shellcheck on everything touched → fresh
repo-wide grep for every retired name → wrapper targets verified to exist →
path resolution from a non-repo cwd → real status → real restart both
directions → real deploy (with go-ahead if remote) → structural
verification that a promotion-only environment truly cannot build → honest
reporting of what was actually run vs. only reviewed.
