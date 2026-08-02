# Matching rules

All logic lives in `packages/dba/src/msg-workout-matching.ts`, pure and
tested in `msg-workout-matching.test.ts`. `matchMsgWorkout({ workoutName,
workoutBody, candidates })` runs the stages below, in order, against
`candidates` — every message in the lead's linked Beeper conversation
(already scoped to that conversation by the caller,
`msg-workout-analyze.ts`; the engine itself does no conversation
filtering).

## Name parsing (`parseWorkoutName`)

- **Day + time**: `YY-MM-DD__HH-MMZ`, e.g. `26-08-01__14-16Z`. `Z` means
  UTC — the parsed instant is `Date.UTC(2000+YY, MM-1, DD, HH, MM)`.
- **Day only**: `YY-MM-DD` optionally followed by a lowercase letter suffix
  (`26-08-01`, `26-08-01b`) — the suffix (from `generateWorkoutName` in
  `leads.ts`, disambiguating same-day workouts) is parsed but never used
  for date matching.
- **Anything else** (no date recognized at all, e.g. Message Creator's own
  `"26-08-01; ai bot"` naming, or a freeform name) → `undated`, regardless
  of candidates.

## Stage 1 — day + time (±30 min)

Only runs when the name has a parsed day+time. Candidates = messages whose
timestamp is within **±30 minutes** of the parsed instant.

- Exactly 1 → `linked` (`reason.type: "exact-time"`).
- 0 → `no-candidates` (nothing written anywhere; re-checked on next run).
- \>1 → `proposal` (`reason.type: "ambiguous-time"`), candidates sorted by
  time proximity, confidence = `1 - delta/30min`, closest one tagged
  `"closest-timestamp"` in its `reasons`.

**Deliberate choice, not in the original spec text**: on 0 in-window
candidates, Stage 1 does **not** fall through to Stage 2 (day-only). Only
Stage 2's own ambiguity (>1 same-day candidates) explicitly falls through
to Stage 3. A day+time name is the most specific signal available; treating
"nothing in the ±30 min window" as `no-candidates` rather than silently
re-trying with a full-day window avoids linking (or proposing) against a
message the name's own precision explicitly ruled out.

## Stage 2 — day only

Only reached for a day-only name, or as Stage 1's fallthrough is **not**
taken (see above — day-only names go straight here). Candidates = messages
whose **local calendar day** (`getFullYear()%100`/`getMonth()+1`/`getDate()`
— the same local-time getters `generateWorkoutName` itself uses to build a
day-only name, so bucketing matches how the name was generated) equals the
parsed day.

- 0 → `no-candidates`.
- Exactly 1 → `linked` (`reason.type: "single-day"`).
- \>1 → Stage 3.

Timezone correctness at midnight boundaries is explicitly not critical
here (matches the day-only convention already in use), only consistency
with how workout names are generated.

## Stage 3 — exact normalized `p1_you` / `p1_she`

Only reached with ≥2 same-day candidates. `parseWorkoutDirectionAndText`
reads the workout body's first line for a `p1_you;`/`p1_she;` prefix
(case-insensitive) after `normalizeForExactMatch` (CRLF/CR→LF, trim, runs
of spaces/tabs collapsed to one space, per line — whitespace/line-ending
differences only, text and meaning preserved).

If a direction was found: filter same-day candidates to
`isSelf === (direction === "you")` **and** whose own
`normalizeForExactMatch(text)` equals the workout's (post-prefix)
normalized text.

- Exactly 1 → `linked` (`reason.type: "exact-text"`).
- \>1 → `proposal` (`reason.type: "ambiguous-exact"`, confidence 0.95,
  `reasons: ["same-day", "direction-match", "exact-text-match"]`).
- 0, or no `p1_you`/`p1_she` prefix at all → Stage 4.

## Stage 4 — fuzzy (never auto-links)

Only reached with ≥2 same-day candidates and no unique exact match. Scores
every same-day candidate by **named, explicit components** (never a lone
magic number):

| Component | Weight | Condition |
|---|---|---|
| `same-day` | 0.25 | fixed — already true to reach this branch |
| `direction-match` | 0.25 | only if the body had a `p1_you`/`p1_she` prefix and it matches `isSelf` |
| `text-similarity:<n>` | up to 0.35 | `textSimilarity()` (normalized Levenshtein ratio, 0..1) × 0.35, only added when similarity > 0 |
| `closest-timestamp` | 0.15 | the single same-day candidate with the smallest time delta to the first candidate in the list |

Confidence = sum, clamped to `[0,1]`, rounded to 2 decimals. Every
component that contributed is named in that candidate's `reasons[]` — a
reviewer can always see *why* a number is what it is. Result is always
`type: "proposal"` (`reason.type: "fuzzy-only"`) — Stage 4 never links
automatically, by construction (there is no code path from Stage 4 to
`type: "linked"`).

## Batch entry points

- `analyzeMsgWorkoutsForLead(leadName, leadLoca)` — one lead.
- `analyzeNewMsgWorkoutsForCurrentUser()` — every lead of the **current**
  user only (never a cross-user/all-users batch — forbidden by spec).

Both skip any workout that's already linked or already has a proposal (any
status) — see `proposal-schema.md` for exactly what "already analyzed"
means.
