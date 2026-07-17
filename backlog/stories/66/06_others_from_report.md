# Story 66 — Others (decisions, problems, limitations, proposals)

## Problems encountered

- **The QNAP host is currently completely unreachable** (100% ping loss,
  SSH TCP-connect timeout on 5 separate attempts over several minutes) —
  discovered while trying to do the requested diagnostics, and a separate,
  more severe issue than the keepalive disconnect the incident report was
  about. Could not be resolved from this session (no physical/alternate
  access to the QNAP). Reported honestly as unknown rather than guessed —
  see `05_tasks_and_checklist.md` Task 1.
- **A real bug in my own first-draft fix**, caught before it ever touched
  the real QNAP: `remote_job_start`'s first version wrapped the user
  command in a nested `bash -c '...'` string. The one real caller passes
  `cd '$QNAP_REPO_DIR' && bash .../06_deploy.sh` — which contains its own
  single quotes, breaking the outer quoting the instant it was generated.
  Caught by testing the function against a mocked `run_remote_capture`
  (a throwaway script sourcing the real `lib.sh` but overriding just that
  one function to print instead of connect) — this is now a reusable
  technique worth remembering for testing other SSH-adjacent bash
  functions without needing real network access. Fixed with base64
  encoding instead of nested quoting.

## Decisions made

- **Poll interval default of 15 seconds** for `run_remote_job_with_progress`
  — a judgment call, not specified in the input. Frequent enough to feel
  responsive for a human watching, infrequent enough not to hammer the SSH
  connection during a multi-minute build.
- **Blunt "last 4000 bytes" tailing** (`remote_job_tail`) instead of
  incremental byte-offset tracking across polls — accepts some duplicate
  output between polls in exchange for not needing exact stream bookkeeping
  across independent, possibly-failed connections. Given the primary
  purpose is "prove the job is still alive and show recent progress," not
  a perfectly deduplicated log stream, this is an intentional simplification
  rather than an oversight.
- **Did not extend this mechanism to `00_qnap_shared/06_deploy.sh`** (also
  builds, from local source, over SSH-in-the-sense-of-being-run-directly-
  on-the-QNAP-host — but per Story 63, there's no SSH wrapper for shared at
  all; a user running it does so already logged into the QNAP directly, so
  there's no SSH-session-vs-remote-job distinction to fix there in the
  first place). Out of scope, not overlooked.
- **Did not extend it to `07_qnap_prod_ssh`'s scripts** — none of them
  build; `06_last_from_test.sh` in particular is already a handful of
  short, fast remote calls, not a long silent one.

## Not done / left undone

- **Real end-to-end verification against the actual QNAP** — blocked on
  the host being reachable (Task 4). This includes: confirming the
  detached job actually survives a real dropped connection (not just the
  local simulation), confirming `run_remote_job_with_progress` correctly
  reports a real remote exit code, and — separately — the original
  diagnostic questions from Input 1 (does the interrupted build's image
  exist, is TEST running on it) that still need answering once the host
  responds again.
- **Cleanup of old job files** under `.runtime/remote-jobs/` on the QNAP
  host — `remote_job_start` never deletes old `.log`/`.done` files from
  previous runs. Not a correctness problem (each job gets a unique
  `<timestamp>-<pid>` ID), but they'll accumulate over time.

## Proposals

- **Once the QNAP is reachable again:** check its real state directly
  (`docker ps`, `docker images`, the `.image-tag.chad-dashboard.env`
  contents, `chad-dashboard-test`'s actual running image) before doing
  anything else — this answers the original Input 1 diagnostic questions
  that this Story couldn't reach. If the interrupted build did produce a
  usable image, no rebuild is needed — only a restart (or nothing, if
  `chad-dashboard-test` already picked it up before the connection dropped).
- **A periodic cleanup of `.runtime/remote-jobs/*.log`/`*.done`** (e.g. an
  age-based prune) would be a reasonable small follow-up once this
  mechanism has been in use for a while — not worth building speculatively
  now.
- **Consider applying the same detached-job pattern to any future
  long-running remote operation** this repo adds (the compendium at
  `documentation/ai-docs/bash-scripts-standard-compendium.md` could
  eventually gain a section on this — not added there yet, since this
  Story is CHAD-specific incident response, not the cross-project
  standard document itself; a good candidate for a future update to that
  compendium once this mechanism has actually proven itself against the
  real QNAP).
