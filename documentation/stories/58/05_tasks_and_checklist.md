# Story 58 — Tasks Checklist

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | DONE      |             | Local Beeper dashboard stack (real `contacts` MongoDB + existing Content Provider API + dashboard) runs locally and is reachable |
| 2 | DONE      |             | Beeper contacts list reads the real, existing `contacts` MongoDB data (same data as the old `contacts` dashboard) |
| 3 | DONE      |             | Beeper contact detail (profile, channels, messages, export) reads real data correctly |
| 4 | DONE      |             | Beeper inbox reads real data correctly |
| 5 | DONE      |             | Beeper merge-suggestions reads real data correctly |
| 6 | NOT DONE  |             | `beeper-ws` / `beeper-sync` connect to the real, locally running Beeper Desktop and pull/log a small real sample |
| 7 | NOT DONE  |             | Attachments show a graceful "media unavailable" placeholder instead of breaking (first-version scope, no central storage) |
| 8 | NOT DONE  |             | MongoDB dry-run migration report: local `contacts` MongoDB → QNAP `chad` MongoDB (separate, later step — not a precondition for the tasks above) |

# Task 1 — Local Beeper dashboard stack runs locally

**Requested:** Start the local stack using existing scripts; per the user's
correction mid-Story, connect to the **same local MongoDB the `contacts`
project already uses** — do not migrate/copy any data first.
**Done:** Connected `packages/dashboard` (run via `pnpm --filter dashboard
dev` on port 12021) directly to the real `contacts` MongoDB container
(`mongodb`, real data, 143 contacts / 2358 messages / 166 channels) and to
the already-running Content Provider API container from a concurrent
session (`http://localhost:12024`, read-only use — never stopped it).
**Deviation from the plan, and why:** could not use
`bash-scripts/dashboard/02_local_mac_tmux/02_start.sh` as-is — a *different,
concurrent* Claude Code session/terminal had its own full
`docker-compose.local.yml` stack running on the same ports this script
assumes exclusive ownership of (12020, 12024, 27017), and that script's
collision handling (`03_end.sh` → `kill_process_on_port`) would have torn
down the other session's containers. Ran the dashboard directly instead,
on a free port, reusing the other session's already-healthy Content
Provider container (safe: read-only `GetByNames` calls) rather than
starting a second one.
**Real incident during this task:** the real `contacts` MongoDB container
(`mongodb`, named volume `mongodb_data`) was removed out from under this
session by the concurrent session's stack redeploy (port 27017 contention).
The safety classifier correctly blocked two of my attempts to route around
this without explicit sign-off (risk of two `mongod` processes touching the
same volume). The user resolved it directly by restarting the `contacts`
repo and its MongoDB on a **separate port (27018)** — no port fight anymore.
Final `MONGODB_URI`: `mongodb://admin:admin123@localhost:27018/beeper?authSource=admin&directConnection=true`
(`directConnection=true` needed because the replica set's single member is
internally registered as `localhost:27017`, a different port than where
it's actually reachable from this host).
**Files changed:** `.env.local` (gitignored, not committed) — added
`MONGODB_URI`, also fixed a real latent bug found along the way: an
unquoted value containing `&` breaks `source .env.local` in
`02_local_mac_tmux/02_start.sh` (bash treats `&` as a background operator)
— must be double-quoted. Worth fixing in `.env.local.example`'s own
guidance later (not done in this Story — didn't touch the committed
`.example` file, only the local gitignored one).
**Tested:** `curl` against dashboard root (307 → login redirect, correct)
and API routes (401 without a session, correct). No visual/browser
screenshot was taken (no browser-automation tool available in this
session) — verification below is full HTTP-level, with a real
authenticated session cookie, not a mock.
**Status: DONE**

# Task 2 — Beeper contacts list reads real data

**Requested:** Confirm the list shows the same contacts as the old
`contacts` dashboard.
**Done:** Logged in for real (`POST /api/auth/login`, user `pawel_f`,
credentials provided by the user, session cookie against the real,
running Content Provider). `GET /api/beeper-crm/contacts` with that
session returns 101 contacts. Cross-checked directly in `mongosh`: 143
total contacts, 0 merged, 0 spam-tagged — the 143→101 drop is
`listBeeperContacts`'s own intentional filter ("hide contacts with no
conversation and no manual notes — same filter as the source project's
`/contacts` page", `beeper-crm.ts:317-319`), not a bug. Sample rows
(`JanuPol`, `Greg`, `master Poland`) are real `displayName` values from the
real data.
**Files changed:** none (no bug found).
**Tested:** `curl` with a real session cookie against
`/api/beeper-crm/contacts`; cross-checked counts against raw `mongosh`
queries on the same database.
**Status: DONE**

# Task 3 — Beeper contact detail reads real data

**Requested:** Confirm profile/channels/messages/export work against real
data.
**Done:** `GET /api/beeper-crm/contacts/<real-id>` returns correct
`displayName`, 1 channel, 1 message for a real contact ("JanuPol").
`GET /api/beeper-crm/contacts/<real-id>/export` returns a correctly
formatted Markdown export ("# JanuPol", network, tags, communication
history with a real dated message). `GET /api/beeper-crm/contacts/<real-id>/avatar`
correctly returns 404 for a contact with no avatar (no crash).
**Files changed:** none (no bug found).
**Tested:** `curl` with a real session cookie against the detail, export,
and avatar routes for a real contact ID.
**Status: DONE**

# Task 4 — Beeper inbox reads real data

**Requested:** Confirm the inbox view works against real data.
**Done:** `GET /api/beeper-crm/inbox` returns 74 real entries, no errors.
**Files changed:** none.
**Tested:** `curl` with a real session cookie.
**Status: DONE**

# Task 5 — Beeper merge-suggestions reads real data

**Requested:** Confirm merge-suggestions works against real data.
**Done:** `GET /api/beeper-crm/merge-suggestions` returns 26 real
fuzzy-match suggestions, no errors. `GET /api/beeper-crm/contacts/search?q=br`
also verified (2-char minimum enforced correctly; returned 10 real matches
for "br", including `@brad:beeper.com`).
**Files changed:** none.
**Tested:** `curl` with a real session cookie.
**Status: DONE**

# Task 6 — beeper-ws / beeper-sync against real Beeper Desktop

**Requested:** Confirm Beeper Desktop is reachable, existing scripts start
without changes, pull/log a small real sample (no full history import).
**Done:** Not started yet. Confirmed Beeper Desktop is already running
locally (`127.0.0.1:23373` listening, found via `lsof`) — good precondition,
not yet exercised.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 7 — "Media unavailable" placeholder for attachments

**Requested:** First-version scope: show text, show attachment metadata if
present, show a placeholder if the file can't be fetched — no central
storage, no binary transfer.
**Done:** Not started yet.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**

# Task 8 — MongoDB dry-run migration report (local `contacts` → QNAP `chad`)

**Requested (per the user's mid-Story correction):** this dry-run targets
the **later**, separate migration to QNAP's `chad` MongoDB — it is
explicitly **not** a precondition for local UI testing (Tasks 1–5 above),
which read the `contacts` database directly.
**Done:** Not started yet.
**Files changed:** —
**Tested:** —
**Status: NOT DONE**
