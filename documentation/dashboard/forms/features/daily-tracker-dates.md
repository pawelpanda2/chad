# Daily Entry / Tracker / Date Entry / Dates

Status: Stage 1-3 done and verified against real data (2026-07-12). Stage 4
(CSV/TSV importer with preview) **not built yet** — deferred until explicitly
requested; no bulk import of real spreadsheet data has been run.

## 1. What this is

Four views, built to match Google Sheets screenshots supplied as the exact
visual/structural spec (not inspiration) for the first real non-owner user,
`kamil_s`:

- **Daily Entry** (`/dashboard/daily-entry`) — two-column spreadsheet-style
  form, saves one record per submit.
- **Tracker** (`/dashboard/tracker`) — sortable/filterable table of all Daily
  Entry records, grouped/colored to match the sheet (TRAINING/ACTION/TEXTING/
  RESULTS), sticky header.
- **Date Entry** (`/dashboard/date-entry`) — two-column form, same pattern.
- **Dates** (`/dashboard/dates`) — sortable/filterable table of all Date Entry
  records.

Deliberately built as new standalone routes+sidebar entries rather than nested
under the existing generic `/dashboard/forms` hub, to minimize clicks (sidebar
→ view, one click) per the stated UX priority. The old Forms hub's own
Daily/Date Entry tiles were left untouched (not removed) — this is the one
intentional deviation from "don't touch existing functionality", justified by
the explicit "minimum clicks" requirement; it's pure addition, not a removal.

## 2. Data flow (audited and proven end-to-end, not just read from code)

```
dashboard page (client)
  → fetch /api/forms/daily-entry or /api/forms/date-entry (GET list, POST save)
    → getCurrentUserFromCookies()  [packages/dashboard/lib/session.ts]
      → resolveCurrentUser(repoGuidFromCookie), validated against the real
        chad_admin user list — never trusts the cookie blindly
    → runWithRepoContext(user, ...)  [packages/dba/src/repo-context.ts,
      AsyncLocalStorage — no hardcoded repo GUID anywhere in this path]
      → dba: saveDailyEntry / getAllDailyEntries / saveDateEntry /
        getAllDateEntries  [packages/dba/src/leads.ts]
        → invokeContentProvider([...])  [packages/dba/src/client.ts]
          → HTTP POST to chad-content-provider-api's /invoke
```

No hardcoded `pawel_f` GUID or path found anywhere in this flow — confirmed
by reading the code AND by a live test proving `kamil_s`'s session resolves
to his own repo (`8b603669-f8e6-4224-bd78-a474998995fa`, logical name
`chad_kamil_s`), never `pawel_f`'s.

### `chad_admin` — what it actually stores

repoGuid: `0fc7da8d-3466-4964-a24c-dfc0d0fef87c` (this is `pawel_f`'s own
repo — the admin user list lives inside it as a Text item).

Structure found by direct inspection: folder `01` (logical name `users`) →
`01/01` is the `chad_admin` Text item, body is a YAML `users:` list of
`{repoGuid, username, email, passwordHash, createdAt, updatedAt}`. That's
**all** it stores — there is no existing "logical CP paths per feature"
registry in `chad_admin`. The `actions/daily` and `actions/dates` logical
paths used by this feature are hardcoded as string literals directly in
`packages/dba/src/leads.ts` (`saveDailyEntry`, `saveDateEntry`,
`getAllDailyEntries`, `getAllDateEntries`), the same way every other CP path
in this codebase is (e.g. `leads`, `msg planner`) — not read from any
config/registry. If a real per-feature path registry is wanted inside
`chad_admin`, that's a new mechanism to design, not something this task
found already existing — flagging rather than inventing it.

### Real bugs found and fixed along the way

Two backend bugs were found by actually testing against real
`kamil_s` data (not just reading code) — see
`documentation/dba/bugs/getlist-valuetuple-and-date-entries-mismap.md` for
full detail:

1. `getAllDateEntries()` returned the parent folder's directory listing for
   every entry instead of each entry's own data.
2. The pattern it (and the pre-existing `getAllDailyEntries()`) used —
   `IManyItemsWorker.GetList` — is not callable via `/invoke` at all, for
   any user (C# ValueTuple parameter, unsupported by the string-args
   resolver). Fixed by switching both functions to the documented,
   already-proven `GetByNames` + `Body`-map pattern (same one Msg Planner
   uses) — no Content Provider C# changes.

Both fixes verified via a full save → read-back → field-by-field-compare
round trip against `kamil_s`'s real repo, and via real HTTP requests to
`GET /api/forms/daily-entry` / `GET /api/forms/date-entry`.

## 3. Data model

Storage remains schema-less YAML (`saveDailyEntry`/`saveDateEntry` just
`yaml.dump()` whatever object they're given) — no Content Provider schema
change was needed or made. Field keys are the literal sheet column names
(spec requirement: "nie zmieniaj nazw"):

**Daily Entry** — `DATE, STATE, TRAINING TIME, VERBAL EXERCISES, INFIELD,
THEORY, FIELD REVIEW, ACTION TIME, OUTINGS, APPROACHES, LONG INTERACTIONS,
NUMBERS, FIRST MESSAGES, RESPONSES, DATES SET UP, DATES`. `OUTINGS` was
missing from the pre-existing Forms-hub Daily Entry form/payload — added
here; no backend change needed since storage is schema-less.

**Date Entry** — `DATA, ŹRÓDŁO, NAZWA, LINK, PULL, CLOSE, JAKOŚĆ`.

**Values are stored as plain strings, not typed** (e.g. `"NIE"`/`"TAK"`
literally, `PULL` as `"TRUE"`/`"FALSE"` strings, `JAKOŚĆ` as a string that
may contain a comma). This matches the pre-existing storage convention for
every other CP-backed form in this app (nothing here uses typed
booleans/enums/numbers in storage) — introducing a stricter typed model
(boolean storage, a `no/close/yes` enum, numeric quality) was raised as an
option but **not implemented**, to avoid a bigger, riskier change than this
task's scope; the AUTO computation functions below normalize on read
(`"TAK"`/`"TRUE"`/`"1"` → truthy, `,` → `.` for decimals) so the schema-less
strings are safe to compute over as-is.

### Item naming — changed from dates to sequential numbers

`generateEntryName()` previously produced date-based names
(`26-07-12`, `26-07-12b`, ...). Changed to plain sequential zero-padded
numbers (`01`, `02`, `03`, ...) — the date is already inside the entry's own
body (`DATE`/`DATA` field), so repeating it in the item name was redundant.
Old date-named entries already saved are untouched (read path doesn't care
about the name's format, only its position in the parent folder's `Body`
map) — confirmed: the one pre-existing real entry for `kamil_s`
(name `26-07-12`) still reads back correctly.

## 4. Time format

**Not normalized in this pass.** Forms still take free-text strings
(`"2:00:00"`, `"0:30:00"`) exactly as the Google Sheet shows them, stored
as-is. A canonical "minutes as integer, formatted for display" model was
discussed as the better long-term direction but changing it now would touch
every existing Daily Entry record's stored format — deferred as a decision
requiring explicit confirmation before migrating existing data, not
something to silently change.

## 5. AUTO fields — reconstructed rule, confirmed by project owner

`packages/dba/src/leads.ts`: `computeDailyAutoFieldsByDate()` (pure
function, no CP calls — takes already-fetched Date Entry fields, groups by
`DATA`):

| Column | Rule |
|---|---|
| PULLS — AUTO | count of that day's Date Entry records where `PULL` is truthy |
| CLOSES — AUTO | sum of `CLOSE` weights for that day: `NIE=0`, `BLISKO=0.5`, `TAK=1` |
| QUALITY D/P — AUTO | average `JAKOŚĆ` of that day's records where `PULL` is truthy (others excluded) |
| QUALITY C — AUTO | average `JAKOŚĆ` of that day's records where `CLOSE=TAK` (`BLISKO` does NOT count) |

Verified against the project owner's worked example (two same-day records:
`PULL=false/CLOSE=BLISKO/JAKOŚĆ=8.0` and `PULL=true/CLOSE=TAK/JAKOŚĆ=8.5`) —
computed `{pullsAuto:1, closesAuto:1.5, qualityDpAuto:8.5, qualityCAuto:8.5}`,
matching exactly.

**Not independently re-confirmed:** averaging behavior for 3+ qualifying
records on the same day (only a 2-record case was in the supplied data) —
project owner's own caveat, carried forward here, not re-derived.

`GET /api/forms/daily-entry` computes this server-side (fetches both Daily
and Date entries, matches by day) and merges the four AUTO values into each
row before returning — the Tracker page just renders whatever it receives,
no client-side computation.

## 6. Testing performed (real, not just code reading)

- Full daily-entry save → read-back → 16-field comparison: all matched.
- `getAllDateEntries()` fix verified against `kamil_s`'s one pre-existing
  real entry (previously returned garbage, now returns correct fields).
- AUTO fields computed against a real 2-record same-day test case, matched
  the project owner's worked example exactly.
- `GET /api/forms/daily-entry` and `GET /api/forms/date-entry` tested via
  real HTTP requests (not just the `dba` layer) with a `kamil_s` session —
  both return correctly shaped, correctly computed data.
- `pnpm --filter dba build` and `pnpm --filter dashboard exec tsc --noEmit`
  both clean.
- Full local Docker rebuild+redeploy (`03_local_mac_docker/06_deploy.sh`)
  succeeded with the new pages/routes included; `next build` passed (no new
  lint/type errors).

**Not done / explicitly deferred:**
- Real browser login as `kamil_s` (no known password locally — tested via
  a session cookie constructed the same way the login route does, not
  through the login form itself).
- Dark mode visual check, 13"/15" viewport check — pages use existing
  `dark:` Tailwind classes matching the rest of the app's convention, but
  not independently screenshotted.
- Scenario C (Kamil never sees Pawel's data): follows structurally from
  the already-proven `AsyncLocalStorage` isolation (same mechanism proven
  for leads in the per-user-isolation feature), not re-tested end-to-end
  specifically for these four new views.
- Test data cleanup: a test Daily Entry (`26-07-12`, item loca `04/02/01`)
  and two test Date Entries (`02`/`03`, `DATA: 2026-01-15`) were saved
  under `kamil_s` during verification. No delete method was found/used
  anywhere in this codebase's Content Provider client — leaving them in
  place rather than guessing at an unverified deletion mechanism. They're
  clearly identifiable as test data (`ŹRÓDŁO: TEST`, `NAZWA: test1/test2`).

## 7. Manual import (Stage 4 — not built)

Not implemented in this pass. When requested, the plan is: paste
TSV (tab-separated, header row matching the exact column names above) →
parse → normalize (comma-decimal → dot, `TAK`/`NIE`/`1`/`0` → whatever
storage type is decided) → **preview only** (row count, per-row errors,
duplicate detection) → explicit confirmation → then and only then save,
scoped to the current session's user (never an arbitrary repoGuid from
input text) → re-read to verify. No real data import has been run.

## 8. Known limitations

- No typed model (everything is schema-less string YAML) — matches
  pre-existing convention elsewhere in this app, not a regression.
- Time values are free text, not normalized to minutes.
- AUTO field averaging-for-multiple-records-per-day is unverified against
  a larger dataset.
- `chad_admin` has no logical-path registry; paths are hardcoded in `dba`.
- No importer yet.
