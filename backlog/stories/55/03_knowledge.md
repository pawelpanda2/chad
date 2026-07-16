# Story 55 — 03_knowledge.md

## Global knowledge read first

- `documentation/ai-docs/knowledge/01_ai_start.md`, `02_what-and-where.md`,
  `03_story-standard.md` — read in full per the standard's own instruction,
  before any Story-specific work. `01_ai_start.md`/reorganized
  `knowledge/` layout is itself new (see "Organizational work" below) —
  this Story is the first one created under the new convention the user
  asked for.
- `documentation/dashboard/common/features/responsive-layout-standard.md` —
  the single layout standard (`DashboardPageShell`/`EditorPageShell`).
  Needed because Task 2 (Back button) and Task 3 (Reports mobile layout)
  both live inside this shell system, not ad-hoc page markup.
- `documentation/dashboard/common/features/shared-text-editor-toolbar.md` —
  describes `TextEditorWithToolbar` (CodeMirror, Preview/Editor tabs).
  Needed for Task 4. **Note:** the doc mentions `label`/`icon` props that
  do not actually exist on the component's real props type — doc is
  stale on that detail; verified against the actual source instead of
  trusting the doc for the props shape.
- `documentation/dashboard/forms/features/reports-form.md` — Reports form
  background (two-stage panel + editor, rebuilt in Story 53). Needed for
  Tasks 1, 3, and 4 (all three touch this exact form).

## Task 1 — Voice recording: codebase facts

- Confirmed via full-repo grep (`packages/dashboard`, `packages/dba`,
  `package.json` dependencies) that this is **entirely greenfield** — zero
  existing references to `SpeechRecognition`, `MediaRecorder`,
  `getUserMedia`, Whisper, or any transcription library anywhere in the
  repo. No partial implementation to build on or conflict with.
- `TextEditorWithToolbar` (`components/shared/text-editor-with-toolbar.tsx`)
  already exposes a `toolbarExtra?: React.ReactNode` prop (line ~33) — an
  existing, unused extension point in the toolbar row. This is the natural
  place to inject a "Record" control without modifying the shared
  component's internals or coupling it to speech-recognition concerns.
- Report content is authored in Polish (dashboard chrome/labels are in
  English, e.g. "Create", "Write your report...", but this is a
  single-user personal tool for a Polish-speaking owner — report content
  itself should be assumed Polish by default, language must not be
  hardcoded so it can be changed later).

## Task 2 — Back button: full inventory (from Explore survey)

No shared Back button component exists anywhere — every occurrence is
built inline per-page. Full inventory, all currently **left-aligned**
(first child of the shell's `toolbar` flex row):

| Page | Style | Navigation |
|---|---|---|
| `leads/details/page.tsx:258-266` | custom `<button>`, icon+text | `router.push(returnTo \|\| "/dashboard/views?view=leads")` |
| `views/page.tsx:333-335` (Leads), `:438-441` (Reports), `:532-535` (Tracker/Dates) | `Button size="sm"`, icon+text | `router.push(pathname)` (strips query) |
| `statuses/page.tsx:574-582` | custom `<button>`, icon+text | local state reset, no navigation |
| `todo-msg/edit/page.tsx:148-151` (error fallback), `:160-167` (normal) | icon-only, `EditorPageShell` | `router.push("/dashboard/todo-msg")` |
| `leads/msg-workout/page.tsx:161-167` (error), `:173-180` (normal) | icon-only, `EditorPageShell` | `router.push(...)` to lead details/views |
| `forms/page.tsx:717-720` (Reports, icon-only), `:806-808` (Action), `:904-906` (Daily Entry), `:980-982` (Date Entry), `:1100-1102` (Add Lead) | mixed icon-only/icon+text | `router.push(pathname)` |
| `beeper/inbox/page.tsx:46-50`, `beeper/merge/page.tsx:100-104`, `beeper/[id]/page.tsx:241-245,257-262,287-291` | `Link asChild`, icon+text | hardcoded `/dashboard/beeper` |

**Deliberate exclusions (with reason, per "Nie twórz wyjątków bez
uzasadnienia"):**
- `app/(error)/error/401/page.tsx`, `403/page.tsx` — outside the
  `(dashboard)` route group entirely, centered auth-error card layout (not
  the dashboard shell), and literally labeled "Go Back" not "Back" using
  `window.history.back()`. Not "a dashboard page" in the sense Task 2
  means.
- `msg-planner/page.tsx` — has **no** Back button today at all (confirmed
  absent, matches the feature doc's note that this page is "not yet
  migrated" to the shell standard). Task 2 asks to reposition *existing*
  Back buttons, not add new ones to pages that lack them — treated as
  out of scope, flagged in `06_propositions.md`.

`DashboardPageShell`/`EditorPageShell` (`components/shared/
dashboard-page-shell.tsx`, `editor-page-shell.tsx`) only expose a
`toolbar` slot — they don't render Back themselves, so today's
inconsistency is structural (every caller free-hands its own toolbar
JSX), not a simple prop flip.

## Task 3 — Reports Create button: current layout facts

`app/(dashboard)/dashboard/forms/page.tsx`, reports branch lines 713-793.
Row 1 (731-767): Date/Kind/Rest-of-name, `grid md:grid-cols-[auto_auto_1fr]`.
Row 2 (768-778): plain `flex gap-3 items-end` containing the read-only
"Generated name" `Input` (`w-[320px]`) **and** the Create `Button`
side-by-side, conditionally rendered only while `!isReportCreated`.

Whole-file `sm:`/`md:`/`lg:` grep: only 4 hits, all `md:` grid-column
patterns (lines 731, 814, 838, 1117) — **no `sm:` breakpoint precedent
exists anywhere in this file** to copy; any mobile-specific behavior here
will be the first `sm:` usage in this file.

## Task 4 — Editor default tab: current facts

`TextEditorWithToolbarProps` (`components/shared/
text-editor-with-toolbar.tsx`, lines 15-38) has no tab-related prop today.
`activeTab` state (line 75): `useState<"preview"|"editor">("preview")` —
hardcoded, always Preview, no way to override per the doc's claimed but
nonexistent `label`/`icon` props (doc is stale here).

Four usages, all currently default to Preview (none pass anything tab-
related, because nothing exists to pass):
- `forms/page.tsx:782-790` — Reports, mounted only once
  `isReportCreated` is true (conditional render, not always-mounted), so
  it mounts **fresh** every time a report is created — no remount/stale-
  `useState`-initializer concern when adding a `defaultTab` prop.
- `leads/msg-workout/page.tsx`, `todo-msg/edit/page.tsx`,
  `msg-planner/page.tsx:301-308` — all edit-existing-content flows.

## Organizational work performed during this Story's setup (not a Checklist task)

Before writing this Story's own documentation, the user asked (in a
separate, mid-turn message — `01_input.md` Input 2) to reorganize
`documentation/ai-docs/knowledge/` into `01_ai_start.md`/
`02_what-and-where.md`/`03_story-standard.md`/`04_deployment-rules.md`,
moving `documentation/ai-docs/what-and-where.md` into that directory and
fixing every cross-reference repo-wide. Done directly (mechanical,
well-specified, low-risk, fully reversible via git) rather than deferred
into this Story's own plan-approval gate — see `05_report.md`'s
organizational section for exactly what changed. This Story (55) is the
first one whose own `01_ai_start.md`-first reading order reflects that
reorganization.
