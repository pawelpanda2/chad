# Daily Entry / Tracker / Date Entry / Dates

Status: done and verified against real data, including a real CSV import
(2026-07-12). Stage 4 (in-app CSV/TSV importer with a preview UI) **not
built** — the one real import done so far was run as a one-off script after
explicit user confirmation, not through an in-app importer.

## 1. What this is

**Not standalone pages.** Tracker and Dates are menu-selectable views inside
the existing `/dashboard/views` page (`app/(dashboard)/dashboard/views/page.tsx`);
Daily Entry and Date Entry are menu-selectable forms inside the existing
`/dashboard/forms` page (`app/(dashboard)/dashboard/forms/page.tsx`). An
earlier pass in this session built these as four new standalone routes +
sidebar entries — that was a misunderstanding of the existing structure,
corrected: the standalone routes/sidebar entries were deleted, and the real
work went into improving the existing pages' visual styling (more
Google-Sheets-like, matching the screenshots supplied as the exact
visual/structural spec for the first real non-owner user, `kamil_s`) and
fixing bugs in them, in place.

- **Forms → DAILY ENTRY**: two-column spreadsheet-style form (green header),
  saves one record per submit.
- **Views → TRACKER**: sortable/filterable table of all Daily Entry records,
  grouped/colored to match the sheet (TRAINING/ACTION/TEXTING/RESULTS),
  sticky header, group-color header row above the column headers. The
  leftmost "item" column (internal item name) is not displayed — it's a
  purely internal identifier.
- **Forms → DATE ENTRY**: two-column form (blue header), same pattern.
- **Views → DATES**: sortable/filterable table of all Date Entry records.

## 2. Data flow (audited and proven end-to-end, not just read from code)

```
Views page (client)  → fetch /api/views (GET, combined dates+daily+AUTO)
Forms page (client)  → fetch /api/forms/daily-entry or /api/forms/date-entry
                         (POST save; GET also exists but /api/views is the
                         real consumer the Views page renders from)
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
to his own repo (`8b603669-f8e6-4224-bd78-a474998995fa`), never `pawel_f`'s.

### `chad_admin` — what it actually stores (and a live login break caused by a restructure)

`chad_admin` is its own repo (logical name `chad_admin`, resolved directly
by that name — not nested inside `pawel_f`'s repo). Structure: folder `01`
(logical name `users`) → `01/01` is a Text item (logical name `users-list`),
body is a YAML `users:` list of `{repoGuid, username, email, passwordHash,
createdAt, updatedAt}`. That's **all** it stores — no per-feature CP-path
registry. The `actions/daily` and `actions/dates` logical paths used by this
feature are hardcoded as string literals directly in `packages/dba/src/leads.ts`
(`saveDailyEntry`, `saveDateEntry`, `getAllDailyEntries`, `getAllDateEntries`),
same as every other CP path in this codebase (e.g. `leads`, `msg planner`).

Mid-session, the user restructured this data on disk (Dropbox-synced repos
folder) — the repo's logical name and the item's logical name both changed
(previously resolved via a `"root"` alias + item literally named
`chad_admin`; now the repo itself is named `chad_admin` and the item is
named `users-list`). This broke login for **every** user, since
`getUsersFromSharpRaw()` in `packages/dashboard/lib/user-service.ts` had the
old args (`["root", "users", "chad_admin"]`) hardcoded. Fixed by updating the
args to `["chad_admin", "users", "users-list"]` in `lib/user-service.ts`
(`getUsersFromSharpRaw`, the `getUsersFromSharp` debug-info copy),
`lib/chad-dba/client.ts` (`getUsersList`, unused dead code but same bug),
and `app/api/auth/login/route.ts` (debug-info display only). Verified live:
`POST /invoke` with the new args returns all 4 users (`pawel_f`, `kamil_s`,
`test3`, `test2`); `pawel_f`'s repoGuid also changed as part of the same
restructure (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`); `kamil_s`'s repoGuid
did **not** change (`8b603669-f8e6-4224-bd78-a474998995fa`), confirmed
before trusting the already-completed CSV import (below) still pointed at
the right repo.

### Real bugs found and fixed along the way

1. `getAllDateEntries()` returned the parent folder's directory listing for
   every entry instead of each entry's own data.
2. The pattern it (and the pre-existing `getAllDailyEntries()`) used —
   `IManyItemsWorker.GetList` — is not callable via `/invoke` at all, for
   any user (C# ValueTuple parameter, unsupported by the string-args
   resolver). Fixed by switching both functions to the documented,
   already-proven `GetByNames` + `Body`-map pattern (same one Msg Planner
   uses) — no Content Provider C# changes. See
   `documentation/dba/bugs/getlist-valuetuple-and-date-entries-mismap.md`.
3. Tracker's group-color header row (`isTracker` block in
   `app/(dashboard)/dashboard/views/page.tsx`) only emitted `<th>` cells for
   the training/action/texting/results groups, never for the one
   `group: "none"` column (`DATE`) — the two header rows had mismatched
   total colspan (20 vs 21), misaligning every color band by one column.
   Fixed by adding a placeholder `<th>` sized to the `"none"`-group column
   count.
4. Login broken by the `chad_admin` restructure — see above.

Bugs 1-2 verified via a full save → read-back → field-by-field-compare
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

- Full daily-entry and date-entry save → read-back → field comparison via
  real HTTP requests through `/dashboard/forms`'s actual POST routes
  (`/api/forms/daily-entry`, `/api/forms/date-entry`), with a `kamil_s`
  session cookie built the same way the login route builds one.
- `getAllDateEntries()`/`getAllDailyEntries()` fixes verified against real
  data, including after the CSV import (below).
- AUTO fields computed against a real 2-record same-day test case, matched
  the project owner's worked example exactly; also verified via `/api/views`
  after the real CSV import (24 real date entries feeding AUTO computation
  for 83 real daily entries).
- Tracker header colspan fix verified by recount (columns.length matches on
  both header rows post-fix) and via `pnpm exec tsc --noEmit`/`eslint`.
- Real browser-facing login flow tested via `POST /api/auth/login` after
  the `chad_admin` restructure fix — confirmed all 4 users resolve and
  password validation works (tested with a deliberately wrong password to
  confirm the negative path too).
- `pnpm --filter dba build`, `pnpm --filter dashboard exec tsc --noEmit`,
  and `eslint` across all touched files: clean.
- Full local Docker rebuild+redeploy (`03_local_mac_docker/06_deploy.sh`),
  repeated after each fix in this session, each time re-verified live via
  HTTP against the running stack (not assumed from a successful build).

**Not done / explicitly deferred:**
- Dark mode visual check, 13"/15" viewport check — pages use existing
  `dark:` Tailwind classes matching the rest of the app's convention, but
  not independently screenshotted.
- Scenario C (Kamil never sees Pawel's data): follows structurally from
  the already-proven `AsyncLocalStorage` isolation (same mechanism proven
  for leads in the per-user-isolation feature), not re-tested end-to-end
  specifically for these views/forms.
- AUTO field averaging-for-3-or-more-qualifying-records-per-day: still only
  verified against 2-record cases (the real imported data doesn't happen to
  have a 3+-same-day case either).

## 7. Real CSV import performed (2026-07-12)

The user provided two real files (`~/Downloads/forms/daily_tracker.csv`,
83 real rows spanning 2026-04-19 to 2026-07-11; `~/Downloads/forms/dates.csv`,
24 real rows spanning 2026-04-20 to 2026-07-07, followed by ~2000 empty
template rows that were correctly skipped) and asked for them to be migrated
in so he wouldn't have to retype the data by hand.

This reversed an earlier instruction in the same session not to import any
CSV data — proceeded only after the user's explicit follow-up request, and
after showing a preview (parsed row counts, sample first/last rows, and the
overwrite plan below) and getting explicit confirmation via a direct
question, consistent with this project's established import-safety
convention.

Run as a one-off Node script (`packages/dashboard/import-csv.mjs`, deleted
after use — not a permanent part of the codebase) using the same
`runWithRepoContext` + `saveDailyEntry`/`saveDateEntry` functions the app
itself uses, pointed at the local Content Provider API. No Content Provider
capability was added or bypassed.

**No delete method exists** (`DeleteWorker.Delete()` in the C# is an empty,
unimplemented stub — confirmed by reading it), so junk test entries created
during this session's own verification (`kamil_s`'s daily entries `01`/`02`
and date entries `01`-`04`) were **overwritten in place** — same item name,
real CSV data written via `Put` — rather than left mixed into the real
dataset permanently. This included resolving a genuine same-date conflict:
a test daily entry for `2026-07-10` would otherwise have duplicated the
real CSV row for that same date. The AUTO/OUTINGS/etc. derived columns
present in the sheet's own CSV export were **not** imported — only the raw
columns each form actually stores are, since AUTO values are computed
server-side from the Date Entry data on every read.

Verified post-import via `/api/views`: 83 daily entries, 24 date entries, no
leftover `ŹRÓDŁO: TEST`/`bjk` junk rows, no duplicate `DATE`/`DATA` values,
date ranges match the source CSVs exactly.

**Scope: local Docker dev environment only.** This data was not pushed to
QNAP test or prod — those have their own separate `cp-root` volumes and
would need the same import repeated there (or a proper data sync) if this
data needs to exist in those environments too.

## 8. Known limitations

- No typed model (everything is schema-less string YAML) — matches
  pre-existing convention elsewhere in this app, not a regression.
- Time values are free text, not normalized to minutes.
- AUTO field averaging-for-3+-records-per-day is unverified against a
  larger dataset (only 2-record same-day cases confirmed, in both the
  worked example and the real imported data).
- `chad_admin` has no logical-path registry; paths are hardcoded in `dba`.
- No in-app importer with a preview UI yet — the one real import done was a
  one-off script, not a reusable feature.
- The imported real data exists only in the local Docker dev environment,
  not QNAP test/prod.
