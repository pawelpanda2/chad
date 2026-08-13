# Story 120 — Other notes

## How this Story actually unfolded

The written spec (`01_input.md`) asked for canonical Folders URLs, real
CP-link hrefs, and a fixed shared history. Implementation followed it
closely — until live testing surfaced that several assumptions baked into
that spec didn't match what the user actually wanted once they saw it
running:

1. The local Wstecz/Naprzod arrows around GO were removed as "competing
   history" per the spec's own instruction — but they're a different,
   structural mechanism (address-tree up/redo), not a visited-order replay,
   and were restored (redesigned as a proper undo/redo stack, not the old
   single-entry version).
2. The CP-link's default click behavior was corrected from same-tab to
   new-tab (`target="_blank"`), overriding the spec's original "left-click
   → same tab" instruction.
3. The CP-link's target view was corrected twice: first from the full
   Folders GUI to a new chrome-free "Item View" (matching the spec's
   framing), then further split by item type — Text → Item View, Folder →
   Knowledge's own card-grid view — which required Knowledge to gain a
   whole new address-based mode alongside its existing name-slug browsing.

None of this was dishonesty or scope-padding — it's what actually happened
when a large, detailed spec met live testing. Recorded here so a future
reader of this Story isn't confused by `05_tasks_and_checklist.md`
describing a materially different end state than `01_input.md`/`02_plan.md`
originally proposed.

## Architectural decision: three chrome levels for one CP Item

By the end of the Story, a CP Item can be viewed through three different
surfaces, chosen by context:

- **Folders** (`/dashboard/folders/<slug>`) — the full admin/power-user
  browsing+editing GUI (Add/Delete/Move/repo-picker/Loca-input). Unchanged
  in spirit; only its URL/history mechanism changed.
- **Knowledge** (`/dashboard/knowledge/<slug>` for a Folder, or its
  pre-existing name-slug routes) — the "nice" card-grid browsing view, no
  admin controls.
- **Item View** (`/dashboard/item-view/<slug>` for a Text item) — a single
  document's Preview/Editor/Save, no browsing chrome at all.

A CP-link resolves to Knowledge or Item View by the target's type, never
Folders. This wasn't in the original plan; it emerged from live
back-and-forth and is now the intended shape.

## `cp_1` SMB credential handling (security note)

Mid-Story, the local Docker deploy was blocked by a stale `cp_1` mount that
needed sudo to repair. The user provided a sudo password directly in chat
to unblock it. It was written straight to the gitignored `.env.local` via
one Bash command and never echoed back, printed, or written anywhere else
(no report, no Story file, no commit) — consistent with the existing
`ai-docs/tests/local-smoke-login.md` convention for handling credentials
supplied this way. That fixed the sudo step but the underlying SMB login to
the QNAP host still failed with a separate, still-missing credential
(`CP1_SMB_USER`/`CP1_SMB_PASSWORD` or a Keychain entry) — per the user's
explicit choice, this was left unresolved rather than requesting a third
credential over chat; Docker verification for the final round was skipped
instead (see `05_tasks_and_checklist.md` Task 8).

## Known limitation / follow-up

**Not live-verified:** Knowledge's address mode, Item View's Folder→Knowledge
redirect, and the by-id route's type-based redirect (Task 5/6) are
typecheck-clean, unit-tested (`packages/dba/src/knowledge.test.ts`, the
codec tests), and `next build`-clean, but the local Docker container is
still running the build from before these changes (`cp_1` blocker — see
above). **Before trusting these in production:** redeploy locally once
`cp_1`'s QNAP SMB credentials are available, then re-run (or extend)
`.runtime/story-120-smoke/smoke.mjs` — it already has the Folders-side
assertions in place and was mid-update for the Knowledge-address-mode
assertions when the blocker hit.

## Not attempted / out of scope

- No changes to `packages/net-content-provider` or any DB query path
  outside `packages/dba`/`packages/content-provider`.
- The pre-existing `router.replace` call sites in Beeper/multiview/
  msg-workout/ai-prompts pages were deliberately left untouched — they
  don't call the new `notifyReplace()` opt-in, so they keep behaving
  exactly as before this Story (see the shared-navigation-history doc).
- No PROD deploy, no `git push`, per the input's own boundaries.
