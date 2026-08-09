# Story 114 — Others

## Known limitation — no real ~25-item Knowledge section to visually confirm the scroll

Section 1.11 of the request asks for a ~25-document section in "test/mock
data" to confirm the per-card vertical scrollbar. Real Knowledge categories
in this environment (`Verbal Game`, `Lack of knowledge`, `Edit Test
Category`, `Deep Test Category`) top out at 4 items per card today — none
has anywhere near 25. Per the request's own constraints (`nie dotykaj
chad_shared ani realnych danych`, `nie migruj danych`), I did not fabricate
a 25-item section in `chad_shared` to force this. The height-cap/scroll
behavior for a 25-item card is instead verified by:
- `computeRowCaps` unit tests (`knowledge-layout.test.ts`) with count=25 and
  count=11 inputs, confirming the cap lands at the flat
  `maxVisibleRowsBeforeScroll` threshold (10, per-card, Task 3's
  simplification of the original row-averaging rule — see
  `05_tasks_and_checklist.md` Task 3) independent of any neighboring card;
- direct code inspection: `KnowledgeFolderGrid` always renders the rows
  container with `overflow-y-auto overflow-x-hidden` and applies
  `maxHeight` whenever `computeRowCaps` returns non-null for that card — the
  mechanism is unconditional, not something that only "happens to work" for
  the item counts that exist today.

If/when a real category grows a large section, this is worth a follow-up
live screenshot, but isn't a code change.

## Local Docker `pg` module error (pre-existing, unrelated)

During `03_re-start.sh`, the QNAP-Postgres-restore helper step logged
`Cannot find package 'pg'` and then `ECONNREFUSED` connecting to
`100.117.139.83:12040`. This is a pre-existing auxiliary migration/seed
script issue (unrelated to any file this Story touched) — the dashboard
container itself built, started, and served correctly (`05_status.sh`
showed all three containers healthy, dashboard responding on :12020), and
the full manual smoke (login, Examples hub, Knowledge v1, live Knowledge
v2 across categories and viewport widths) worked normally on the existing
local Postgres data. Flagging for whoever owns that script/Story next,
not fixed here (out of scope).

## Playwright `browser_take_screenshot` timeouts (tooling, not app)

The screenshot tool intermittently timed out at "waiting for fonts to
load" on some `/dashboard/knowledge/*` pages, while `browser_evaluate`
calls against the same page returned instantly and `document.fonts.status`
was `"loaded"`. Treated as a Playwright-MCP tooling quirk, not an app bug —
verification for those pages was done via `browser_evaluate` (grid
`gridTemplateColumns`, per-card `getBoundingClientRect()`,
`document.documentElement.scrollWidth` vs `clientWidth`) instead of pixel
screenshots, which is actually a more precise check for this specific
layout algorithm anyway.

## Docker build cache went stale mid-Story (see Task 3/4 note in `05_tasks_and_checklist.md`)

A normal cached `02_build.sh` run silently produced an image still running
Task 2's pre-follow-up code after Task 3/4's source changes — confirmed by
grepping the compiled bundle inside the running container. `docker compose
build --no-cache` (same config/tagging as the official script) fixed it
both times it recurred. Not root-caused, not fixed in the build script
itself (deployment tooling, out of scope here) — flagged as a real
follow-up worth investigating separately, since it means a green "Image
built" log is not on its own sufficient evidence that a local Docker smoke
test is against current code.
