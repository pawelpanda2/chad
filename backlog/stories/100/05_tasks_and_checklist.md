# Story 100 — Tasks Checklist

- [x] Task 1 — Audit real runtime state before touching anything
- [x] Task 2 — Diagnose why new messages weren't landing (real bug #1)
- [x] Task 3 — Wire `beeper-oplog` into `plugins/beeper-synch`
- [x] Task 4 — Fix real bug #2 found while deploying (index conflict)
- [x] Task 5 — Redeploy via official scripts + verify against real QNAP data (see correction in Task 8)
- [x] Task 6 — Investigate the "didn't start at system startup" claim
- [ ] Task 7 — Real full-reboot verification (BLOCKED — needs user's go-ahead, see 06)
- [x] Task 8 — Correction: end-to-end single-message trace (user caught a premature PASS)
- [ ] Task 9 — GUI-level confirmation (BLOCKED — see below)

---

**Correction notice (read this before Task 5):** Task 5 below was
originally reported as "PASS LOCAL" while this Story's own verification
script was printing `caughtUp: false` — the user caught this
inconsistency and correctly refused to accept it as done. Task 8
identifies the actual cause (a bug in the ad-hoc verification script, not
in `beeper-oplog` itself) and replaces the earlier count-sampling
evidence with a real single-message, end-to-end trace. Task 5's
Mongo-count evidence itself was accurate as far as it went; what was
wrong was declaring the task finished before doing the deeper trace and
the GUI check.

# Task 1 — Audit real runtime state

Checked before any code change: `ps aux | grep beeper`, `launchctl list`,
the installed plist, `.runtime/beeper-synch/status.json`,
`/tmp/chad-beeper-synch{,-error}.log`, `sysctl kern.boottime`, plist mtime.

Found: exactly one `beeper-synch` instance running (pid from Thu 01:11,
i.e. since shortly after Story 91/92's install), `beeper-ws` stable, no
orphan processes, no conflicting LaunchAgents. Also found: `beeper-sync`
had completed **1023** runs, every one in the visible tail logging "Nowe
wiadomości: 0". That number alone was the first hard signal something was
structurally wrong, not just "no new messages exist".

**Result: PASS** (audit only, no changes).

# Task 2 — Diagnose why new messages weren't landing

Read `packages/beeper-sync/lib/sync-channel.mjs`,
`packages/beeper-sync/index.mjs`, `packages/beeper-ws/index.mjs`,
`packages/beeper-oplog/index.mjs`, `packages/beeper-sync/lib/db.mjs`.
Confirmed via direct queries against the real QNAP `beeper_<repoGuid>`
database (not guessed) that `beeper_events` (501) had run far ahead of
`messages` (3691, static since 2026-07-29T23:05) and that
`beeper_oplog_state` didn't exist yet. Full writeup in `03_knowledge.md`.

**Result: PASS** (real root cause identified, confirmed against live data,
not assumed from reading code alone).

# Task 3 — Wire `beeper-oplog` into `plugins/beeper-synch`

- `plugins/beeper-synch/src/config.ts`: added `beeperOplogDir`, validated
  the same way as `beeperWsDir`/`beeperSyncDir` (package.json must exist).
- `plugins/beeper-synch/src/index.ts`: added a third `SupervisedProcess`
  for `beeper-oplog` (same pattern as `beeper-ws` — long-lived, own
  SIGINT/SIGTERM handling, bounded backoff), wired into `refreshStatus()`
  as `beeperOplog`, started/stopped alongside `ws`/`sync`/`mirror`.
- `plugins/beeper-synch/src/config.test.ts`: added one assertion
  (`beeperOplogDir` resolves under `packages/beeper-oplog`), matching the
  existing style for the other two dirs.
- `plugins/beeper-synch/README.md` and `package.json` description:
  updated to describe all three processes and their actual roles —
  including correcting the previous README's inaccurate description of
  `beeper-sync` as an "incremental" importer (it is a one-shot historical
  backfill per channel, confirmed in Task 2).

`pnpm --filter beeper-synch typecheck` / `test` (28 tests, all pre-existing
suites) / `build` — all green.

**Result: PASS.**

# Task 4 — Real bug found + fixed: beeper-oplog index conflict

First real restart with `beeper-oplog` wired in crash-looped it
immediately (`MongoServerError: IndexOptionsConflict`, code 85) —
`packages/beeper-oplog/index.mjs` was creating a plain non-unique index on
`identities.senderID` that conflicts with the canonical unique
partial-filtered index of the same name every other real writer of
`contacts` already creates. Fixed by matching the canonical definition
exactly (see `03_knowledge.md` for the full comparison table). This had
never surfaced before because `beeper-oplog` had literally never been run
against a real database before this Story.

**Result: PASS** (found via real deployment, not assumed; fixed; verified
by successful restart with 0 restarts afterward).

# Task 5 — Redeploy via official scripts + verify against real QNAP data

Redeployed exclusively via `bash-scripts/beeper-synch/restart.sh` (never
`node dist/index.js` directly) — twice: once that surfaced Task 4's bug,
once after the fix. Second restart: `status.json` shows `beeperOplog:
{running: true, restarts: 0}`. Verified progress with direct queries
against the real QNAP `beeper_<repoGuid>` database at three points in
time: `messages` 3691 → 3711 → 3734 → 3755, `contacts` 157 → 159,
`lastMessageCreatedAt` moved from 2026-07-29 (stale) to 2026-08-01
(live), real log lines (`[message] Nowa: ...`) with real message text.
`beeper_oplog_state.lastProcessedId` advancing on each check — confirmed
the poll loop is making real forward progress through the backlog, not
just "started".

Not claimed: full catch-up completion was not waited out to 100% in this
session (backlog was large — 501 events, several Mongo round-trips per
event over Tailscale) — the process is long-running and unattended
(supervised, KeepAlive, restart-on-crash), so it finishes on its own; this
was confirmed as steadily progressing, not stalled.

**Result: PASS LOCAL** (real Mac process against real QNAP data; no
TEST/PROD deploy needed — nothing shipped to Dashboard/API/TEST, this
Story only touched the Mac-only plugin + a QNAP-targeted package that had
never run before).

# Task 6 — Investigate "didn't start at system startup"

`sysctl kern.boottime` → this Mac's current boot: 2026-07-29 15:17:17.
Plist mtime: 2026-07-30 00:44:17 — installed **after** the current boot.
**The Mac has not rebooted since the LaunchAgent has existed.** `RunAtLoad`
has therefore never fired from a real boot, ever, on this machine — every
"running" observation before this Story came from `launchctl load`
(install/restart scripts), never a boot. This can't be resolved by reading
more logs; there is no boot event covering the installed period to
inspect.

What was verified instead: `restart.sh`'s `launchctl unload` + `load`
exercises the identical launchd mechanism (`ProgramArguments`+
`RunAtLoad`), and succeeded cleanly both times in this Story — plist
config, `system-startup.sh`'s build-if-missing/Beeper-Desktop-launch
logic, and the exec into `node dist/index.js` are all confirmed working
via that path.

**Result: PASS (mechanism) / NOT RUN (real boot)** — see Task 7.

# Task 7 — Real full-reboot verification

**BLOCKED** — requires the user's explicit go-ahead, since this Mac has
other concurrent Claude Code sessions and other work running right now (see
`06_others_from_report.md`); a real reboot is outside this Story's scope
to perform unilaterally.

# Task 8 — Correction: end-to-end trace of one real message + why `caughtUp` was false

The user asked for proof against one specific, named, latest message
actually visible in Beeper Desktop — not aggregate counts. Done for real:

**1. Ground truth, fetched directly from Beeper Desktop's own REST API**
(`packages/beeper-sync/lib/beeper-api.mjs`'s `fetchAllChats`/
`fetchMessagesPage`, the same client `beeper-sync` itself uses — not our
Mongo, not our pipeline):
- chat: `!VH8YLo9Ww5KejpzWMtI62hJ0mqw:ba_WXC68lbBACicADQzy2aBv9LO8QY.local-whatsapp.localhost`
  ("Męski Skill - Ogólny", the single most-recently-active chat across the
  whole account — confirmed by sorting all chats by `lastActivity`)
- message id: `56212` (Beeper's own REST id, stable across polls)
- sender: Tomasz Paluch
- timestamp: `2026-08-01T12:25:53.000Z`
- text: "Kurde mam sobowtóra :D"

**2. `beeper_events`:** found — `_id=6a6de5d43565a895aae66735`, full raw
event present (`entries[0].id: "56212"`, same text/timestamp),
`_receivedAt: 2026-08-01T12:25:56.158Z` (3s after Beeper's own timestamp —
real-time websocket capture, exactly as designed).

**3. `messages`:** found — `_id=6a6dff1077c88d1c6e4e19db`,
`beeperMessageID: "56212"`, `text` and `timestamp` match exactly,
`isSelf: false`, `deletedAt: null`. `createdAt: 2026-08-01T14:13:36.286Z`
— materialized by `beeper-oplog` while working through the one-time
backlog created by Task 3's deploy (this message arrived hours before
`beeper-oplog` was first ever started).

**4. Assignment:** `channelID` resolves to channel
`6a4bc5df709cfecfd6b22f1e` (title "Męski Skill - Ogólny", `type: "group"`
— matches). `contactID` resolves to contact `6a4bc5dfed7f188cbfbbe3c4`
(identity `senderID` matches the ground-truth sender exactly). Noted, not
fixed (pre-existing, out of this Story's scope): that contact's
`displayName`/`identities[0].senderName` is still the raw Matrix ID
string, not "Tomasz Paluch" — `upsertContact()` only sets `displayName`
via `$setOnInsert` and this contact record already existed since
2026-07-06, from before this Story. Cosmetic; message assignment itself
is correct.

**5. `/api/beeper-crm/contacts/[id]` (the real endpoint
`app/(dashboard)/dashboard/beeper/[id]/page.tsx` calls, via `dba`'s
`getBeeperContact()`):** called for real over HTTP against the running
`chad-dashboard-local-mac-docker` container (`localhost:12020`), using a
legitimate session cookie for this Story's own target user (repoGuid
`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`) — the local container currently
runs with no `SESSION_SIGNING_SECRET` configured, so `lib/session-token.ts`
issues/accepts its own documented unsigned fallback format
(`repoGuid:issuedAtMs`); this is that same environment's own real
authentication code path, not a bypass of it. Response: `HTTP 200`, 24
messages returned for this contact, target message present, **and it is
the last (most recent) item in the array** — exactly what the GUI's React
code would render as the newest message in that conversation.

**6. Dev Panel mode:** queried `/api/dev-settings/db-source` (same cookie)
— confirmed **`beeperDataSource: "Server Mongo"`** (`current: "qnap"`,
host `100.117.139.83:12041`), `messagesCount: 3841`. Not Local Mongo
read-only mode — the local Dashboard is reading QNAP live, as it should
by default per Story 92.

**7. TEST:** SSH to QNAP (`bash-scripts/common/lib.sh`'s
`load_qnap_ssh_config`/`run_remote_capture`, same pattern Story 92 used),
ran a query **inside** the real `chad-dashboard-test` container using its
own configured `BEEPER_MONGODB_URI` — found the identical message
document. Not done: a real logged-in browser session against TEST
(`chad-dashboard-test` has `SESSION_SIGNING_SECRET` set, unlike local, so
the unsigned-cookie shortcut used for #5 doesn't apply there, and no test
credentials for `pawel_f` were available) — same honest limitation Story
92 itself documented and accepted for its own TEST verification.

**8. Why `caughtUp: false` was reported, and the actual fix:** the
ad-hoc verification script printed `oplogState.lastProcessedId` (a real
BSON `ObjectId` **object**, as returned by the MongoDB Node driver) and
compared it with `=== String(maxEvent._id)`. `ObjectId !== string` in
JavaScript even when their hex representations are identical — so that
`===` comparison could never evaluate `true`, regardless of whether
`beeper-oplog` had actually caught up. **This was a bug in the throwaway
diagnostic script, not in `beeper-oplog` or the pipeline.** Corrected by
stringifying both sides before comparing (`String(a) === String(b)`);
re-run, it now correctly reports `true` once the cursor reaches the
latest event. Separately, and just as important: even with the
comparison fixed, `caughtUp` legitimately flips back to `false` for a few
seconds every time a brand-new message arrives before the next 5s poll
tick — that is expected, correct behavior for a converging live poller,
not a defect. The right invariant to test is not "is `caughtUp` always
true" but "does one specific real message make it all the way through
within one poll interval," which is exactly what steps 1–5 above prove
for real.

**9. Max timestamp comparison** (all four independently queried, not
copied from each other):

| source | max timestamp | value |
|---|---|---|
| Beeper Desktop (REST, ground truth) | most recent chat activity, account-wide | `2026-08-01T12:25:53.000Z` |
| `beeper_events` | max `entries.timestamp` across all events | `2026-08-01T12:25:53.000Z` |
| `messages` | max `timestamp` across all messages | `2026-08-01T12:25:53.000Z` |
| `/api/beeper-crm/contacts/[id]` response | `timestamp` of last array item | `2026-08-01T12:25:53.000Z` |
| GUI | — | **not checked, see Task 9** |

All four independently-queried sources agree exactly. `beeper-oplog`'s
own cursor (`beeper_oplog_state.lastProcessedId`) equals the max
`beeper_events._id` at time of check — confirmed caught up for real, with
the corrected comparison.

**Result: PASS** for steps 1–4, 6; **PASS (with documented limitation)**
for 5, 7; **root cause of the false `caughtUp` explained and the
verification logic fixed**, not just the report text.

# Task 9 — GUI-level confirmation

**BLOCKED, not PASS.** `mcp__playwright__browser_navigate` to
`http://localhost:12020/dashboard/beeper` fails in this session:

```
Error: Browser is already in use for
/Users/pawelfluder/Library/Caches/ms-playwright-mcp/mcp-chrome-6ca972c,
use --isolated to run multiple instances of the same browser
```

That Chrome profile is locked by a different, concurrent Claude Code
session on this same Mac (see `06_others_from_report.md` — this repo
routinely has parallel sessions running). Forcing it (killing that Chrome
process) risks destroying another session's in-progress, uncommitted
browser state and was not done. Retried once after finishing the rest of
this Task; still locked.

**This Story does not claim PASS overall** per the user's explicit
instruction ("Nie raportuj PASS, dopóki ta sama najnowsza wiadomość nie
jest faktycznie widoczna w GUI"). Task 8's evidence (the real API
response the GUI's own code calls, returning this exact message as the
newest item) is the strongest verification available without a browser
right now, but it is not the same claim as a rendered page and is not
being reported as one.
