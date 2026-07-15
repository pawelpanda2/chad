# Knowledge — Story 56

Pointers discovered while working this Story, scoped to it (see
`documentation/ai-docs/knowledge/03_story-standard.md` for the distinction
vs. the global `documentation/ai-docs/knowledge/`).

- `documentation/dashboard/forms/features/reports-form.md` — authoritative
  description of the Reports two-stage form (Story 53) and its Story 55
  additions (`defaultTab`, voice recording, `BackButton` migration). Read
  before touching `forms/page.tsx`'s Reports branch — explains why
  date/kind/suffix lock after Create and why Generated name has two modes
  (live memo vs. server-confirmed name).
- `documentation/dashboard/common/features/responsive-layout-standard.md`
  — the layout standard (`DashboardPageShell`/`EditorPageShell`,
  `BackButton`, `main`'s `p-0.5`) that Tasks 4/5/6 build on top of. Lists
  exactly which pages are "on the standard" vs. not (used to scope Task 6's
  rollout — see `02_plan.md`'s "Scope boundary").
- `documentation/dashboard/common/features/voice-recording.md` —
  `SpeechToTextEngine` architecture (`useSpeechToText` hook, Web Speech API
  engine, Chrome/Edge-only limitation as an approved tradeoff, not a bug).
  Task 2's new recording panel reuses this hook unchanged (only adds a
  `clear()` method) — do not touch `lib/speech/*`.
- `packages/dba/src/report-entries.ts` — `getAllReportEntries` vs.
  `getReportEntryByLoca`: the latter already correctly distinguishes
  "missing Body" (`undefined`/`null`) from `""`; the former did not (Task 3
  root cause). Also documents the deliberate naming collision-avoidance
  with the unrelated root-level `reports.ts` (`GetReports`/
  `GetReportByName`) — never merge the two.
- `packages/dashboard/components/shared/back-button.tsx` — the Story 55
  "Back" standard being superseded/extended by Task 5/6's `NavGroup`. Two
  standalone pre-shell error-card usages (`leads/msg-workout`,
  `todo-msg/edit`, both `className="ml-0"`, centered `min-h-[60vh]` cards
  outside any shell) are intentionally left as plain `BackButton` — see
  `02_plan.md`.
- No existing app-wide navigation-history context existed before this
  Story (checked via grep for `createContext`/history-like hooks under
  `components`/`hooks`/`lib`/`app`) — `dashboard-history-provider.tsx` is
  new, not a rename/extension of something existing.
