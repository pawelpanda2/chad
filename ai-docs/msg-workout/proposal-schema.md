# Proposal storage and schema

## Where proposals live

Logical CP folder chain, root → `links` → `msg workout` → `<leadName>`,
created via `item-ops.ts`'s `findOrCreateFolderChain(["links", "msg
workout", leadName])` — same model as every other CP folder chain in this
repo (e.g. `views/dates`): physical child folders are numeric, logical
names live in each folder's own `config.name`. **Never** a hand-created
filesystem folder literally named `links`.

One Text item per analyzed-but-not-auto-linkable workout, named after the
workout's own logical name (`createOrGetChild(leadFolder, workoutName,
"Text")`). Workout names are already unique within one lead's `msg
workout` folder (`generateWorkoutName`, `leads.ts`), so this item name is:

1. A stable, human-readable **proposal key** ("the proposal for workout X
   under lead Y").
2. The **"already analyzed" marker** — if this item exists, in *any*
   status, the workout is never re-analyzed
   (`getMsgWorkoutLinkEligibility`'s `"already-analyzed"` result).

## Body (YAML)

```yaml
lead: "26-07-27_pn_Klaudia_delfin"
msgWorkoutItemId: "<the workout item's own CpItem._id>"
msgWorkoutItemName: "26-08-01b"
status: "proposed"   # proposed | accepted | rejected | obsolete
analyzedAt: "2026-08-01T14:20:00.000Z"
reason:
  type: "ambiguous-time" | "ambiguous-exact" | "fuzzy-only"
  summary: "..."
candidates:
  - messageId: "<stringified Mongo ObjectId>"
    timestamp: "2026-08-01T14:16:00.000Z"
    direction: "you" | "she"
    confidence: 0.87
    reasons: ["same-day", "text-similarity:0.9", "closest-timestamp"]
    textSnippet: "first 40 chars only, never the full message"
```

`reason.type` values are exactly the `ProposalReason`/`MatchResult` variant
names from `msg-workout-matching.ts` (`matching-rules.md`) — never a
free-form string, so a downstream reader can rely on the enum.

`candidates[].textSnippet` is truncated to 40 characters
(`msg-workout-matching.ts`'s `snippet()`) — proposals never store a full
message body, per the "don't log full private conversations" rule.
`parseProposalBody`/round-trip is covered by
`msg-workout-cp.test.ts` against a real (throwaway) Postgres write.

## Statuses

`proposed` (initial, written by analysis) → `accepted` / `rejected` /
`obsolete` are reserved for a future manual-review UI — **this Story does
not build that UI**; the schema and the "any status = already analyzed,
never re-touch" rule are ready for it, but nothing currently transitions a
proposal out of `proposed`.

## Idempotency / no-duplicates rule

`writeProposal(leadName, workoutName, proposal)`:

1. `findOrCreateFolderChain` — safe to call repeatedly (find-or-create).
2. Look for an existing child named `workoutName` under that folder.
3. If found, **return it unchanged** — the new `proposal` payload is
   silently discarded, never written. This is the entire duplicate-
   prevention mechanism: rerunning analysis on an already-proposed workout
   never creates a second item and never overwrites the first one's
   `status` (so a human-set `accepted`/`rejected` — once that UI exists —
   can never be clobbered by a rerun).
4. Only if no existing child is found does it create the item and write
   the body.

`getExistingProposal`/`hasExistingProposal` are **read-only** — they never
call `findOrCreateFolderChain`, only `resolveByNames` (returns `null` if
the chain doesn't exist yet). This matters: a lead that has never been
analyzed must never end up with an empty `links/msg workout/<lead>` folder
just because someone checked whether it had proposals — verified in
`msg-workout-cp.test.ts` ("a lead with no proposals yet never gets an empty
folder created by a read").

Verified live (write → rerun with a different payload → still the original
→ no duplicate item) in `msg-workout-cp.test.ts`, and cross-user isolation
(two throwaway repoGuids, same lead+workout name, completely separate
items) in the same file.
