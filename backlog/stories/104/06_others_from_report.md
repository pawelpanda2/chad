# Story 104 — Others from report

## Architectural decisions

- **New module lives inside `packages/dba`, not a standalone package.**
  `documentation/dba/project-goal.md`'s rule that all raw Content-Provider
  communication must be hidden in `dba` rules out a separate top-level
  package for the actual link-writing/Draft-Lead-creation logic (it needs
  deep CP access). `packages/dba/src/links-v2/` is the module; the
  "extensible provider" architecture requested lives as the `LinkProvider`
  interface inside it, not as physically separate packages per provider.
- **Beeper matching does not reuse `lead-beeper-links.ts`.** Same matching
  heuristic (exact-or-last-9-digit phone), reimplemented independently
  against the raw Beeper Mongo `contacts` collection, so Links V2 has zero
  code coupling to the old module and could be deleted without touching
  it, per "Nie rozwijaj starego modułu Links."
- **`links` YAML carries a bit more than the spec's example.** The user's
  example showed only `chatId`/`type` (Beeper) and `resourceName` (Google
  Contacts). Added `method`, `matchedOn`, `updatedAt` (bookkeeping, for
  idempotent re-sync and the report) and, for Google Contacts only,
  `displayName`/`phone` (denormalized at match time so Lead Details can
  render name/phone without a live People API call per view — Google
  Contacts has no local cache by design, Story 103). Still not "copying
  the whole contact" — no address/org/photo/etc. Flagged during planning
  and accepted before implementation started.
- **Draft-lead "no duplicate" guarantee needs no separate index.** A
  Draft Lead's own `links` item is written immediately at creation time,
  pointing at the Beeper contact that spawned it — the next sync pass
  naturally sees that contact as already-matched while building its
  per-run "which chats are still unmatched" set. No extra lookup table.
- **`draft: true` lives in the lead Folder's `config`, not in `links`.**
  The spec's "never store this info in config" refers to link data
  specifically; `draft` is a bookkeeping flag about the lead itself,
  analogous to the existing Folder `Config.sorting` field (confirmed
  free-form pass-through, no schema change).
- **Report counts use the merge's `addedCount`, not the provider's raw
  match-list length.** Caught while writing `sync.test.ts`'s "no duplicate
  across two runs" case — counting the provider's output directly would
  over-report if a provider ever proposed an already-linked candidate
  (real providers filter this themselves, but the report shouldn't depend
  on every provider getting that right). Fixed in `sync.ts` before this
  was ever shipped.

## Problems encountered

- **`normalizePhoneDigits` name collision with the old Links module.**
  `packages/dba/src/index.ts`'s `export *` barrel failed to build once
  Links V2's own (deliberately independent) copy of this helper existed
  alongside `lead-beeper-links.ts`'s. Resolved by exporting Links V2's
  public surface as named exports instead of a blanket `export *` from
  `links-v2/index.ts` — the internal `phone-utils.ts` helpers stay
  module-private to `links-v2`, never hit the barrel at all.

## Limitations

- **No live, logged-in click-through in this sandbox.** This coding
  environment has no Tailscale/QNAP network access and no `test3`
  password (`E2E_TEST3_PASSWORD` unset — same reason 21 pre-existing test
  files across the repo already fail here for credentials/QNAP-reachability
  reasons unrelated to this Story, confirmed before starting). Verified
  instead: `pnpm --filter dba typecheck/build`, `pnpm --filter dashboard`
  typecheck, the full `packages/dba/src/links-v2/*.test.ts` vitest suite
  (38 tests), the mandatory `pnpm test:tables-sync` regression gate (26
  pass / 7 skip, 0 fail), a full local Docker rebuild
  (`03_local_mac_docker/06_deploy.sh`), and unauthenticated-route smoke
  tests (401/307 on every new and old route, matching the rest of the
  app). The daily scheduler was confirmed to **start** correctly in the
  rebuilt container (`[links-v2-scheduler] starting ...` logged), but its
  first tick's `getUsersListBody()` call appears to hang rather than
  complete — the same host (`100.117.139.83`, QNAP over Tailscale) that
  the container's own startup migration step failed to reach with a fast
  `ECONNREFUSED` moments earlier, so this reads as the same network
  limitation, not a scheduler bug — `isDailySyncDue`'s pure decision logic
  is unit-tested directly, and `runForAllUsers()` follows the exact,
  already-proven `runWithRepoContext` per-user loop from
  `packages/dba/scripts/reconcile-google-sheets.mjs`. **The user should
  confirm the scheduler completes an actual run in their own
  QNAP-connected environment** before fully trusting the "scheduler 05:00
  działa" acceptance criterion.
- **Google Contacts matching lists every contact per sync pass.** Fine for
  a once-daily/on-demand run (same approach the existing Google Contacts
  GUI already uses), but would need pagination-aware batching if a user's
  contact list grows very large — not attempted, not needed yet.
- **`getGoogleContactPerson` (added to `packages/google-contacts`) is
  currently unused** — added while evaluating a live-refresh design for
  Lead Details that was ultimately replaced by denormalizing
  `displayName`/`phone` into the `links` item instead (see Architectural
  decisions above). Left in place as a reasonable single-contact primitive
  for a future provider/feature rather than removed, but flagging it here
  since "added but unused" is worth a second look — a follow-up Story
  should either find a use for it or delete it.

## Follow-up proposals (not implemented, out of scope for this Story)

- A "promote Draft Lead to a normal lead" GUI action (e.g. a one-click
  clear of `config.draft`) — the spec only required drafts to be visible,
  not a dedicated promotion flow; today a user can already edit a draft
  like any other lead, the flag just never gets cleared automatically.
- Matching by identifiers beyond phone (Instagram/Telegram/WhatsApp
  handles, etc.) — the spec explicitly said phone first, "later other
  identifiers"; the `LinkProvider` interface and per-lead `contacts`
  fields already support this without any redesign, just a new matching
  rule inside `beeper-provider.ts`/`google-contacts-provider.ts`.
- A third `LinkProvider` (the spec's "kolejne providery w przyszłości") —
  the module is intentionally built for this (see `types.ts`), but no
  concrete next provider was requested.
