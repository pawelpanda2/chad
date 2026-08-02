# Story 99 — Plan: msg workout ↔ Beeper message linking

## 0. Ground truth established before implementation

- Real repo: `chad` monorepo (git). `chad-dba` (the directory named in the
  prompt's `$repo_path`) is a legacy, non-git directory with none of the
  actual beeper/dashboard code — not used for this Story.
- CP backend today is **PostgreSQL** (`chad-postgres` on QNAP), not the old
  Content-Provider `/invoke` API or Mongo-as-CP. All CP access must go
  through `packages/dba/src/item-ops.ts` (`resolveByNames`, `getItemByAddress`,
  `getChildrenOf`, `createOrGetChild`, `findOrCreateFolderChain`,
  `putItemBody`, `putItemConfig`) — never `invokeContentProvider` directly
  for new code.
- Beeper data lives in Mongo, one db per user: `beeper_<repoGuid>`, only via
  `getBeeperMongoDb(repoGuid)` (`packages/dba/src/mongo.ts`), `repoGuid`
  always from `getCurrentRepoGuid()` (`repo-context.ts`), never a parameter.
- **Stable message identifier decision**: the message ID the GUI currently
  shows (`ParsedWhatsAppMessage.id`) is a content-hash
  (`stableWhatsAppMessageId(timestamp, sender, rawLine, occurrence)`) —
  deterministic but derived, not a DB key, and would change if a message's
  text/timestamp were edited. `beeperMessageID` is nullable and only unique
  combined with `network`. The one field that is always present and
  globally unique per document is Mongo's own `_id` (ObjectId). **Decision:
  `links.beeper.messageId` stores the stringified Mongo `_id`.** This
  requires threading the real `_id` from `messages` documents through
  `whatsapp-messages.ts`'s format+parse round-trip to the client as a new
  optional `dbId` field on `ParsedWhatsAppMessage` (additive, backward
  compatible — existing callers that don't read `dbId` are unaffected).
- Existing prior art, reused not duplicated: `lead-beeper-links.ts` (Story
  90) links a **lead** to a whole **conversation** (`lead_conversation_links`
  Mongo collection) with `method: automatic|manual|suggested`. This Story's
  workout↔message links are a finer-grained sibling concept and get their
  own storage (CP `config.links.beeper` on the workout item itself, plus a
  separate CP proposal tree) — `lead_conversation_links` is only *read* here
  (to resolve which conversation a lead's messages live in).
- msg workout items already exist and are managed by
  `packages/dba/src/leads.ts`: `getLeadMsgWorkoutsByLoca`,
  `getMsgWorkoutForEdit`, `saveMsgWorkout`, `createMsgWorkoutForLead`. New
  code extends this area, doesn't replace it.

## 1. Data model

### 1.1 `config.links.beeper` on a msg workout Text item

```yaml
links:
  beeper:
    messageId: "<stringified Mongo ObjectId>"
    timestamp: "2026-08-01T14:16:00.000Z"   # ISO 8601, the message's own timestamp
    linkedAt: "2026-08-01T14:20:03.512Z"    # ISO 8601, when this link was written
    method: "automatic" | "manual"
```

Written via `item-ops.ts`'s `putItemConfig(item)` — config-only write,
existing `body` untouched. Read the item first (`getItemByAddress`), spread
its existing `config`, only ever set `config.links = { ...config.links,
beeper: {...} }` when `config.links?.beeper` is not already present.
Idempotent: re-running finds `config.links.beeper` already set and reports
`"already-linked"`, never overwrites.

### 1.2 Proposals — logical CP tree, not a physical folder

`findOrCreateFolderChain(["links", "msg workout", leadName])` gives the
per-lead proposals folder (root → `links` → `msg workout` → `<leadName>`,
all logical names in `config`, physical children numeric — same model as
every other CP folder chain in this repo). One Text item per analyzed,
non-linkable workout, **named after the workout's own logical name**
(`createOrGetChild(folder, workoutName, "Text", bodyYaml)`) — workout names
are already unique within one lead's `msg workout` folder
(`generateWorkoutName`), so this item name is a stable, human-readable
proposal key and doubles as the "already analyzed" marker: if this item
exists (any status), the workout is never re-analyzed.

Body (YAML):

```yaml
lead: "26-07-27_pn_Klaudia_delfin"
msgWorkoutItemId: "<workout item's own CpItem._id>"
msgWorkoutItemName: "26-08-01b"
status: "proposed"   # proposed | accepted | rejected | obsolete
analyzedAt: "2026-08-01T14:20:00.000Z"
reason:
  type: "ambiguous-time" | "ambiguous-day" | "no-exact-match" | "fuzzy-only" | "no-candidates"
  summary: "..."
candidates:
  - messageId: "<stringified ObjectId>"
    timestamp: "2026-08-01T14:16:00.000Z"
    direction: "you" | "she"
    confidence: 0.87
    reasons: ["same-day", "direction-match", "text-similarity:0.9"]
    textSnippet: "first 40 chars of the message, never the full body"
```

Never logs/stores full conversation text — only a short, explicitly
truncated snippet per candidate, matching "don't log full private
conversations."

### 1.3 Undated workouts

A workout whose name doesn't parse as one of the two supported shapes
(`YY-MM-DD__HH-MMZ` or `YY-MM-DD[suffix]`) and has no `config.links.beeper`
and no existing proposal item → surfaced read-only by the GUI as "Undated",
not written anywhere new (no separate storage — it's a derived read, same
data source as everything else).

## 2. Matching engine (pure, testable, no I/O) — `packages/dba/src/msg-workout-matching.ts`

```ts
export type MsgWorkoutDirection = "you" | "she" | null; // null = no p1_you/p1_she prefix found

export type MatchResult =
  | { type: "linked"; messageId: string; timestamp: string; reason: LinkReason }
  | { type: "proposal"; candidates: MatchCandidate[]; reason: ProposalReason }
  | { type: "undated"; reason: { summary: string } }
  | { type: "already-linked" }
  | { type: "already-analyzed" }
  | { type: "no-candidates"; reason: { summary: string } };
```

Never `null` for these distinct outcomes (explicit spec requirement).

Stages, run in order, first applicable stage decides (a stage that yields
a decision — linked/proposal/no-candidates — stops the pipeline; per spec
wording only Stage 2 explicitly falls through to Stage 3 on ambiguity, so
Stage 1 with zero in-window candidates reports `no-candidates` rather than
falling back to Stage 2 — documented explicitly in `matching-rules.md`
since the prompt doesn't state this case):

1. **Name has day+time** (`YY-MM-DD__HH-MMZ`, `Z` = UTC): candidates =
   messages in the lead's linked conversation within ±30 min of the parsed
   instant. 1 candidate → `linked`. >1 → `proposal` (`ambiguous-time`). 0 →
   `no-candidates`.
2. **Name has day only** (`YY-MM-DD` + optional letter suffix, suffix
   ignored for date parsing, local-calendar-day bucketing to match
   `generateWorkoutName`'s own local-time convention): candidates = messages
   that day. 1 → `linked`. 0 → `no-candidates`. >1 → Stage 3.
3. **Exact normalized `p1_you`/`p1_she`**: parse workout body's first
   non-empty line for a `p1_you;`/`p1_she;` prefix (trim, CRLF→LF, collapse
   runs of spaces/tabs to one space, on both the workout text and each
   candidate message's text before comparing) + require direction match
   (`you`→`isSelf:true`, `she`→`isSelf:false`). Exactly 1 exact match among
   the day's candidates → `linked`. >1 → `proposal` (`ambiguous-exact`). 0 →
   Stage 4.
4. **Fuzzy** (never auto-links): among the day's candidates, score each by
   named components — `sameDay` (fixed weight since already filtered),
   `directionMatch` (p1_you/p1_she vs `isSelf`), `textSimilarity`
   (normalized Levenshtein ratio between workout body's message text and
   candidate text), `closestTimestamp` (smallest time delta among
   candidates gets a bonus) — confidence = weighted sum, every component
   named in `reasons[]`. Always `proposal` (`fuzzy-only`), never `linked`.

If the workout name doesn't parse as day+time or day-only at all →
`undated`.

## 3. Linking / eligibility — `packages/dba/src/msg-workout-linking.ts`

- `getMsgWorkoutLinkEligibility(item: CpItem, hasProposal: boolean):
  "eligible" | "already-linked" | "already-analyzed"` — pure, checks
  `item.config.links?.beeper` and the caller-supplied proposal-exists flag
  (spec 1.7: skip if linked, if a proposal exists in any status, — manual
  accept/reject/obsolete are just proposal statuses, so "proposal exists"
  already covers them).
- `writeMsgWorkoutBeeperLink(item: CpItem, messageId: string, timestamp:
  string): Promise<CpItem>` — reads config, refuses (returns/report
  `already-linked`) if `config.links.beeper` already set, otherwise merges
  `{ ...config.links, beeper: {...} }` and calls `putItemConfig`.

## 4. Proposals storage — `packages/dba/src/msg-workout-proposals.ts`

- `findOrCreateLeadProposalsFolder(leadName): Promise<CpItem>` — the
  `links/msg workout/<leadName>` chain via `findOrCreateFolderChain`.
- `getExistingProposal(leadName, workoutName): Promise<CpItem | null>` —
  child lookup by name (`getChildrenOf` + find), used for the
  already-analyzed check without creating anything (read path must not
  find-or-create the whole chain if nothing exists yet at the lead level —
  guard with `resolveByNames`/optional lookup, not blind
  `findOrCreateFolderChain`, to avoid creating empty `links/msg workout/X`
  folders during a read-only "list proposals" call).
- `writeProposal(leadName, workoutName, body): Promise<CpItem>` —
  `createOrGetChild` + only `putItemBody` if the item was just created
  (never overwrite an existing proposal — duplicate protection lives here,
  not just in the caller).
- `listProposalsForLead(leadName): Promise<Array<{ name: string; loca:
  string; body: string }>>` — for the GUI/report.

## 5. Batch orchestration — `packages/dba/src/msg-workout-analyze.ts`

- `analyzeMsgWorkoutsForLead(leadName: string): Promise<AnalyzeSummary>` —
  the pilot's core entry point:
  1. Resolve lead item + loca (`resolveByNames`/existing lead lookup).
  2. Resolve the lead's linked Beeper conversation: read
     `listLeadBeeperLinks()` (existing, `lead-beeper-links.ts`) filtered by
     `leadName`; if none, fall back to `findLiveBeeperMatchForLead` (also
     existing) — if still none, every workout for this lead is `undated`
     w.r.t. Beeper (no conversation to match against) and the function
     returns early with that summary (no proposals written — there's
     nothing to propose against).
  3. List messages for that conversation (new thin read in
     `beeper-crm.ts`/reuse `getBeeperContact(conversationId).messages` —
     confirm exact existing accessor before adding a new one, per
     endpoint-rules §4).
  4. `getLeadMsgWorkoutsByLoca(leadLoca)` for the workout list; for each,
     `getMsgWorkoutForEdit`-equivalent to get its `CpItem` (need the real
     item incl. `config`, not just the `MsgWorkoutItem` summary — add a
     `getItemByLoca` call).
  5. Per workout: eligibility check → skip if ineligible; else run the
     matching engine; apply the result (`writeMsgWorkoutBeeperLink` /
     `writeProposal` / nothing for `undated`/`no-candidates` — spec doesn't
     ask `no-candidates` to be persisted anywhere, it's a transient outcome
     reported in the summary only, re-checked on next run since nothing was
     written).
  6. Return counts: `{ linked, proposals, undated, noCandidates, alreadyLinked, alreadyAnalyzed, errors }`.
- `analyzeNewMsgWorkoutsForCurrentUser(): Promise<AnalyzeSummary>` — iterates
  `getAllLeadsWithContacts()` and sums `analyzeMsgWorkoutsForLead` per lead
  (spec 3.4's second safe batch operation; explicitly **not** all-users).

## 6. Stable message `dbId` threading (small, additive)

- `packages/dba/src/whatsapp-messages.ts`: add `dbId?: string` to
  `ParsedWhatsAppMessage`; new `beeperMessagesToParsedMessagesWithDbId`
  (or extend existing function's input type to accept an optional `_id` per
  message and zip it in using the same filter+index correspondence
  `formatBeeperMessagesForExport` already relies on) so the dba function
  produces `dbId` alongside the existing content-hash `id` — `id` stays
  exactly as-is (nothing depends on it changing).
- `packages/dashboard/components/shared/beeper-conversation-view.tsx`: add
  the same optional `dbId?: string` field to the client's independent
  `ParsedWhatsAppMessage` interface (already noted as duplicated-by-design
  from the dba version).
- `packages/dashboard/app/api/beeper-crm/contacts/[id]/route.ts`: pass
  `detail.messages` (which already carry Mongo `_id`) through the
  dbId-aware conversion so `conversationMessages[].dbId` is populated.

## 7. API routes — `packages/dashboard/app/api/msg-workout/**`

Thin adapters only (endpoint-rules §2), each wraps in
`runWithRepoContext(user, ...)` after `getCurrentUserFromCookies()` → 401.

- `POST /api/msg-workout/analyze-lead` — body `{ leadName: string }` →
  `analyzeMsgWorkoutsForLead(leadName)`.
- `GET /api/msg-workout/conversation-links?conversationId=...` — resolves
  the lead linked to `conversationId` (reverse of
  `listLeadBeeperLinks()`), returns
  `{ leadName: string | null, linksByMessageId: Record<string, {loca,name,body}[]>, undated: {loca,name,body}[] }`
  for the GUI to render markers/panel without ever running matching itself.

No global "analyze all users" endpoint (forbidden by spec 4).

## 8. GUI — `packages/dashboard/components/beeper/*`

- `beeper-conversations-view.tsx`: when a contact is selected, also fetch
  `/api/msg-workout/conversation-links?conversationId=<id>` in parallel
  with the existing conversation fetch; pass `showActions` + a
  `renderMessageAction` callback into the existing `BeeperConversationView`
  (it already supports this prop — used today by Message Creator — so the
  right panel doesn't need new layout plumbing, just a new renderer) that
  renders `<MsgWorkoutMarker>` when `linksByMessageId[msg.dbId]` is
  non-empty.
- `msg-workout-marker.tsx` — the compact per-message chip(s); click sets
  `expandedWorkout` state (loca/name/body) in the parent.
- `msg-workout-panel.tsx` — when `expandedWorkout` is set, renders instead
  of (covers) the conversation view, full height of the same right-hand
  `<section>`, with a close (✕) control that clears the state and restores
  the normal conversation view. No new route/page — purely local state.
- `undated-msg-workouts.tsx` — compact list at the top of the same
  `<section>`, rendered only when `undated.length > 0`, each row opens the
  same `msg-workout-panel.tsx` on click.
- GUI never calls the matching engine; it only ever reads
  `linksByMessageId`/`undated` from the API above.

## 9. Docs — `ai-docs/msg-workout/` (7 files, all non-empty)

`ai-start.md` (index, mirrors `ai-docs/beeper/ai-start.md`'s shape),
`architecture.md` (CP+Mongo flow, module map), `beeper-linking.md`
(`config.links.beeper` schema, stable `dbId` decision and why),
`matching-rules.md` (all 4 stages, ±30 min, p1_you/p1_she normalization,
the Stage-1-zero-candidates clarification above), `proposal-schema.md`
(YAML shape, statuses, idempotency/dedup rule), `gui-integration.md`
(marker/panel/Undated, why GUI never matches at render time),
`tests.md` (what's covered where). Update
`ai-docs/begin_here/02_what-and-where.md` and `ai-docs/beeper/ai-start.md`
to point to it (no separate `ai-docs/gui-beeper/` exists, per Story 94's
own prior finding — link from `ai-docs/beeper/` instead, the real Beeper
doc root).

## 10. Pilot, then generalize

Full pilot on `26-07-27_pn_Klaudia_delfin` first (find lead → find/list
`msg workout` children → resolve linked conversation → run
`analyzeMsgWorkoutsForLead` → inspect real outcomes → verify
`config.links.beeper` round-trips → verify proposal YAML → rerun and
confirm zero new items/changes → GUI marker + panel + Undated against this
same lead's conversation). Only after this passes does anything call
`analyzeNewMsgWorkoutsForCurrentUser` more broadly (pawel_f's other leads),
and even then it's additive/idempotent by construction, not a special
"generalize" code path.

## 11. Testing

Per spec 2.4's list, split into pure-logic Vitest (matching stages, name
parsing, normalization, confidence components, eligibility, idempotency
math) and integration (CP write/read roundtrip on a throwaway lead-like
item, Beeper lookup, cross-user isolation with a throwaway repoGuid) — same
split convention as `lead-beeper-links.ts`/`lead-beeper-links.test.ts`.
Every scenario in the spec's list gets a named test; nothing marked PASS
without a real assertion.

## 12. Deployment

Code → tests → `bash-scripts/dashboard/03_local_mac_docker/03_re-start.sh`
→ manual browser check on LOCAL → `bash-scripts/dashboard/08_registry_test/deploy.sh`
→ manual browser check on TEST. PROD stays untouched
(`07_qnap_prod_ssh/06_last_from_test.sh` never invoked this Story).
