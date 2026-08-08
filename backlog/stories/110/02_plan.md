# Story 110 — Plan

Start SHA: `e63c232` (parallel WIP: Story 109 + `leads.ts` date-sort + `vitest.config.mjs` — leave untouched except minimal `leadUuid` on `LeadDashboardItem`)

1. Migration `0003_lead_archives.sql` — table `cp_lead_archives`.
2. Rewrite `lead-archives.ts`: view subdir, readable names, PG metadata store (injectable for tests), sidecar read-compat only.
3. Thin API: resolve owned lead → `leadUuid` + name; list/counts by uuid.
4. Hub label three-line `manually added msg`; route slug → `manually-added-msg`.
5. Tests: naming/collision/rename/atomicity/cross-user/no-sidecar; local Docker + smoke; commit this scope only.
