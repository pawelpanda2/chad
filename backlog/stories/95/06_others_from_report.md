# Story 95 — Others

## Architectural decisions

- `putItemConfig` (both the new `item-ops.ts` wrapper and the
  provider-level methods it calls) is deliberately **not** routed through
  `DbaDataRouter`/the follower outbox — this was already the case for every
  provider's `putItemConfig` before this Story (confirmed by
  `MongoCpProvider.putItemConfig`'s own doc comment: "No `DataWriteCommand`
  exists at this call site"). This Story followed that existing precedent
  rather than inventing a new `DataWriteCommand` kind for it, matching
  `deleteItemByAddress`'s existing "call the primary provider directly"
  pattern in the same file. If Postgres→Mongo follower replication for
  config-only writes is ever needed, that's a separate, larger change
  (`DataWriteCommand` union + router wiring + outbox replay), not something
  this Story's scope justified.
- Config identity protection blocks `id`/`address`/`type`/`name` changes
  outright (409) rather than trying to partially support some of them.
  `type` changes were blocked because Text ↔ Folder conversion has no
  defined semantics for what happens to `body` (Text) vs children (Folder).
- Reused the existing `assertNotSystemFolderWrite(names, "update-body")`
  action value for config writes rather than adding a new `"update-config"`
  enum member — the function treats every non-`"create-child"` action
  identically (checks the folder itself or any descendant), so a new value
  would have been a distinction without a behavioral difference.

## Problems encountered

- During live smoke testing (Task 8), an early probe targeted `views`
  itself instead of the actually-registered `views/daily` system folder,
  so it unexpectedly succeeded and left a stray `tag: "hacked"` custom
  field on `test3`'s `views` folder config. This was **not** a bug in the
  new code — `views` itself was never a registered system folder, only
  `views/daily`/`views/dates`/`leads` are (`SYSTEM_FOLDERS` in
  `system-folders.ts`, unchanged by this Story). The stray field was
  reverted in the same session (config re-saved without it) before
  continuing. Re-testing against the real `views/daily` folder then
  correctly returned `403 SYSTEM_FOLDER_READ_ONLY`.
- The shared Playwright MCP browser was locked by another concurrent
  Claude Code session working in this same repo for the entire local
  Docker smoke-test window, so the UI toggle's interactive behavior (click
  Config, edit, click Body, confirm the draft survived) could not be
  observed in a real browser this session — see Task 9 in
  `05_tasks_and_checklist.md` for exactly what was and wasn't proven as a
  result, and what a follow-up manual check should confirm.
- `03_re-start.sh`'s QNAP-sync step logged a pre-existing, unrelated
  failure (`Cannot find package 'pg'` in an ad-hoc eval, then
  `ECONNREFUSED` reaching QNAP's Postgres sync port) while restarting the
  local stack for this Story's rebuild. Not caused by this Story's changes
  (nothing here touches that script) and the stack still came up healthy
  immediately after — recorded here only so it isn't mistaken for a
  regression if noticed later.

## Follow-up proposals (not implemented this Story)

- **Config `name` (rename) support:** deliberately left blocked, per the
  input prompt's own instruction, because no confirmed-safe rename
  contract exists in `dba` yet — a rename would need to consider anything
  that references an item by its logical name path (e.g.
  `resolveByNames`/`resolveSequence` callers, `system-folders.ts`'s
  `namePath` matching). Worth a dedicated Story if ever requested.
- **Config `type` conversion (Text ↔ Folder):** also blocked outright; a
  real implementation would need a defined migration for `body` ↔
  children semantics and is out of scope here.
- **Manual browser click-through of the Body/Config toggle** — recommended
  as a quick follow-up check once the Playwright browser is free, to close
  the one gap noted in Task 9.
