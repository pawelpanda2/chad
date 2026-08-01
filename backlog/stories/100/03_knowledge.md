# Story 100 — Knowledge

## Real bug #1 (root cause of "messages weren't pulled in"): the continuous
materializer was never deployed

`plugins/beeper-synch` supervised exactly two processes before this Story:

- `packages/beeper-ws` — long-lived WebSocket listener. Beeper Desktop
  pushes events in real time; this process writes every raw event
  verbatim into the `beeper_events` collection. **This part was always
  working** — confirmed 501+ raw events present, growing continuously.
- `packages/beeper-sync` — scheduled every `BEEPER_SYNCH_SYNC_INTERVAL_MS`
  (default 5 min). Its own code (`lib/sync-channel.mjs`) does a **one-time
  historical backfill per channel**: once a channel's `sync_state` reaches
  `status: "fully_synced"`, every later run just logs "już
  zsynchronizowany, pomijam" and returns immediately — it never re-checks
  for messages newer than the backfill. Confirmed from the real log:
  **1023 consecutive `beeper-sync` runs, "Nowe wiadomości: 0" on every
  single one** in the observed tail. This is not a bug in beeper-sync
  itself (it's doing exactly what a historical importer should do) — it
  was simply the wrong tool for "keep discovering new messages forever",
  and nothing else was covering that job.

What was missing: `packages/beeper-oplog` — already fully built (Story 76,
2026-07-22), self-described in its own `package.json` as "NOT deployed
yet". It polls `beeper_events` by `_id` every 5 seconds (own durable
cursor in `beeper_oplog_state`, no MongoDB replica set required — matches
`beeper-mongodb`'s standalone target) and turns each event into real
`contacts` / `channels` / `messages` documents — exactly the "check every
few seconds" mechanism the user guessed already existed. It was never
spawned by `plugins/beeper-synch`, never run standalone, never referenced
in any `docker-compose*.yml`. Both Story 91's and Story 92's own
`06_others_from_report.md` flagged this as a known gap and left it
unaddressed.

**Real evidence of impact** (queried directly against QNAP
`beeper_21d11bdc-...` before any fix):

| collection | count | notes |
|---|---|---|
| `beeper_events` | 501 | raw, growing continuously via beeper-ws |
| `messages` | 3691 | **last `createdAt`: 2026-07-29T23:05:46** |
| `beeper_oplog_state` | *(collection did not exist)* | oplog has never run once |

Today is 2026-08-01 ~16:00 — **messages had been silently stuck for ~3
days** while the raw event feed kept working underneath.

## Real bug #2 (found only once beeper-oplog was actually run against the
real database for the first time)

Wiring `beeper-oplog` in and restarting immediately crash-looped it:

```
MongoServerError: Index: { v: 2, key: { identities.senderID: 1 }, name:
"identities.senderID_1" } already exists with different options:
{ v: 2, unique: true, key: { identities.senderID: 1 },
  name: "identities_senderID_unique",
  partialFilterExpression: { identities.senderID: { $type: "string" } } }
code: 85 (IndexOptionsConflict)
```

`packages/beeper-oplog/index.mjs` created a **plain, non-unique** index on
`identities.senderID` with no name — MongoDB auto-names it
`identities.senderID_1`. Every other real writer of the same `contacts`
collection (`packages/beeper-sync/lib/db.mjs`,
`packages/dba/src/beeper-crm.ts`, `packages/dba/src/beeper-mongo-mirror/
refresh.ts`) creates a **unique, partial-filtered** index named
`identities_senderID_unique`. MongoDB refuses two indexes on the same key
with different options — this had simply never surfaced before because
beeper-oplog had never run against a real database that already had the
canonical index. Fixed by matching beeper-oplog's index definition to the
canonical one exactly (see `packages/beeper-oplog/index.mjs`). This is
exactly the kind of bug Story 92's own `06_others_from_report.md` predicted:
"only surfaces under real, end-to-end, cross-process verification against
a genuinely live system."

## Manual catch-up performed

No separate manual script was run for this — restarting the (now fixed)
`plugins/beeper-synch` supervisor through the official
`bash-scripts/beeper-synch/restart.sh` **is** the catch-up mechanism:
beeper-oplog's cursor started at `null` (never run before), so its first
poll cycle processed the entire existing `beeper_events` backlog. Verified
progressing for real (direct QNAP queries, several samples a few seconds
apart): `messages` 3691 → 3711 → 3734 → 3755 (climbing steadily,
`lastMessageCreatedAt` moved from 2026-07-29 to "now" / 2026-08-01), real
`[message] Nowa: ...` log lines with real message text, `contacts` 157 →
159 (new contacts discovered from previously-unmaterialized messages). The
poll loop keeps running continuously afterward (every 5s), so it also
catches whatever new messages beeper-ws writes going forward — this is
the permanent fix, not a one-off script run.

## Real bug or genuine gap #3: "didn't start at system startup" — could
not be confirmed OR ruled out; the LaunchAgent has never actually been
exercised through a real boot

Checked directly (`sysctl kern.boottime`, plist file mtime):

- This Mac's current uptime started **2026-07-29 15:17:17** (`kern.boottime`).
- `com.chad.beeper-synch.plist` was installed **2026-07-30 00:44:17**
  (Story 91) — i.e. **after** the current boot, and the Mac has not
  rebooted since. `RunAtLoad` has therefore never actually fired from a
  real system boot in this LaunchAgent's entire existence; every time it
  has been "running", it got there via `launchctl load` (install/restart
  scripts) or an earlier manual start, never via an actual macOS boot.

This means the user's claim can be neither confirmed nor disproven from
this machine's history — there simply is no boot event to inspect. What
WAS verified: `bash-scripts/beeper-synch/restart.sh`
(`launchctl unload` + `launchctl load`) exercises the same launchd
`ProgramArguments`/`RunAtLoad` mechanism a real boot would, and it
succeeded cleanly twice in this Story (built if needed, checked/launched
Beeper Desktop, exec'd `node dist/index.js`, reached `ready: true`). What
was **not** verified: an actual full macOS reboot (login-window timing,
Tailscale/network re-establishing cold, disk-unlock timing — boot-specific
conditions a live `unload`/`load` cannot replicate). A real reboot was
deliberately **not** performed unilaterally in this session: the user
runs concurrent parallel Claude Code sessions on this same Mac (see
`[[feedback_parallel_sessions_same_working_dir]]` memory), and a reboot
would kill all of them along with any other work in progress — a
disruptive, hard-to-reverse action outside this task's scope without
explicit confirmation.

## Correction: premature PASS caught by the user, real end-to-end trace done

This Story initially reported Task 5 as done while its own verification
script printed `caughtUp: false`. The user rightly refused to accept that.
Full re-verification against one specific, real, latest message (ground
truth pulled directly from Beeper Desktop's own REST API, not from our
Mongo) is in `05_tasks_and_checklist.md` Task 8 — summary: the message
("Kurde mam sobowtóra :D", chat "Męski Skill - Ogólny", Beeper message id
`56212`, timestamp `2026-08-01T12:25:53.000Z`) was confirmed present, with
matching timestamps, in `beeper_events`, `messages`, correctly assigned to
its channel/contact, and returned by the real `/api/beeper-crm/contacts/
[id]` endpoint as the newest item — with the local Dashboard confirmed in
`Server Mongo` mode and the same document independently confirmed inside
the real `chad-dashboard-test` QNAP container. `caughtUp: false` was a
type-comparison bug (`ObjectId !== String`) in a throwaway diagnostic
script, not a defect in `beeper-oplog`; fixed the comparison and
re-verified `true`. **GUI-level confirmation remains BLOCKED** — the
Playwright browser profile is locked by a different concurrent Claude Code
session on this Mac — so this Story does not claim overall PASS.

## Effective config map (unchanged by this Story, confirmed while
diagnosing)

| process | env source | Mongo target |
|---|---|---|
| `beeper-synch` (supervisor) | `.env.mac-beeper` | n/a (spawns children with `process.env`) |
| `beeper-ws` | `.env.mac-beeper` (own `dotenv.config` with explicit path) | `MONGODB_URI` → QNAP `beeper-mongodb` (Tailscale) |
| `beeper-sync` | `.env.mac-beeper` (own `dotenv.config` with explicit path) | same |
| `beeper-oplog` | inherited from supervisor's `process.env` (its own bare `dotenv.config()` is a no-op here since there's no `.env` file in its cwd, and inherited vars are already set) | same |
| local Mongo mirror (Story 92) | `BEEPER_LOCAL_MIRROR_MONGODB_URI` | separate, one-way QNAP → local |

No env var naming or Server/Local Mongo selection logic (Story 92) was
touched by this Story.
