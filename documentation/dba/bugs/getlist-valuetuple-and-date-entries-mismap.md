# Bugs: `IManyItemsWorker.GetList` unusable via `/invoke`, and `getAllDateEntries` returning the wrong body

Status: fixed 2026-07-12, verified against real data (`kamil_s`, repoGuid `8b603669-f8e6-4224-bd78-a474998995fa`).

## Bug 1 — `getAllDateEntries()` returned the parent folder's own Body map for every entry

**Symptom:** the Dates view would show a list of entries, but every row's fields were empty/wrong — the underlying function never actually fetched each entry's own saved data.

**Cause:** `packages/dba/src/leads.ts`'s `getAllDateEntries()` called `GetByNames(repoGuid, "actions", "dates")`, then set every returned `DateEntryItem.body` to the SAME parent folder's `Body` field (a `physicalKey -> logicalName` directory listing) instead of fetching each child item's own content.

## Bug 2 (bigger) — `IManyItemsWorker.GetList` cannot be called via `/invoke` at all, for anyone

While first attempting to fix Bug 1, I copied the pattern already in `getAllDailyEntries()` (list children via `IManyItemsWorker.GetList`, then `GetItem` each one). Real testing against live data (not just reading code) showed this fails with:

```
Error: API request failed with status 500. InvalidCastException: Invalid cast from
'System.String' to 'System.ValueTuple`2[...]'
```

**Root cause** (file+line): `packages/net-content-provider/.../ManyItemsWorker.cs:60` — `GetList` takes a single C# `(string repo, string loca)` ValueTuple parameter. The `/invoke` string-args resolver (`packages/net-content-provider/api_charp/StringArgsResolver/FindParameters.cs`, `ConvertParamFromString`) has no case for ValueTuple — it falls through to `Convert.ChangeType`, which throws. This means `getAllDailyEntries()` — already in the codebase before this session — **had never actually worked either**, for any user. This is the real explanation for "the view looked right but data wasn't read correctly."

**What was NOT done:** modifying `packages/net-content-provider`'s C# code. Per project owner correction: the reflex to patch/extend the C# resolver was wrong — the existing, documented, and already-proven-working pattern for "list every child of one folder" doesn't need `GetList` at all.

**Actual fix** — `documentation/dba/data-access.md` §5-7 (and the working `getMsgPlannerDateFolders()` in `leads.ts`) already document the correct approach: `GetByNames` on the folder returns `Settings.address` (the folder's own loca) plus `Body` (a `physicalKey -> logicalName` map of children) — no separate list call needed. Each child's loca is `${folderLoca}/${physicalKey}`; fetch its content with a plain `GetItem(repoGuid, childLoca)` call (already proven to work everywhere else in this codebase).

Added a shared helper, `getAllChildTextItems(parentNames: string[])` in `packages/dba/src/leads.ts`, implementing exactly this. Both `getAllDailyEntries()` and `getAllDateEntries()` now call it — no `IManyItemsWorker.GetList`, no C# changes.

## Verification

Tested directly against the real running Content Provider (not mocked), for `kamil_s`:
- `getAllDateEntries()` correctly returns the one pre-existing real entry's actual fields (`DATA`, `ŹRÓDŁO`, `NAZWA`, `LINK`, `PULL`, `CLOSE`, `JAKOŚĆ`), not the folder's directory listing.
- Full save → read-back → field-by-field comparison round trip for a new Daily Entry: all 16 fields matched exactly.
- `GET /api/forms/daily-entry` and `GET /api/forms/date-entry` (real HTTP requests, not just the `dba` layer) return correctly parsed, per-entry data.

## Lesson for future features

Before assuming a CP operation needs a new method (client-side or C#-side): check `documentation/dba/data-access.md` and the closest existing working feature first (Msg Planner's date-folder listing is the template for "list every child of one folder"; the Statuses/contacts pattern with `GetManyByName` is for "find one named child across many different parent folders" — a different shape of problem). Don't reach for `IManyItemsWorker.GetList`/`GetListOfBody`/`PostList` at all — none of the three take plain string args, so none of them are callable via `/invoke`.
