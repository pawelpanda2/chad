# DBA provider-migration audit (Story 72, follow-up)

Full audit of every public `packages/dba` method against the target
architecture:

```
Dashboard
  -> DBA public method
       if (config.mongoEnabled)            { ...MongoProvider... }
       if (config.contentProviderEnabled)  { ...ContentProvider... }
  -> return result
```

Dashboard must never import a provider directly, never branch on
`mongoEnabled`/`contentProviderEnabled` itself, and never call
`invokeContentProvider` itself. All of that lives only inside `packages/dba`.

## Layer A — architecture-boundary check (Dashboard/Console bypassing DBA)

**Finding: a dead, orphaned duplicate of the CP-calling business logic was
still sitting inside the Dashboard package**, calling
`invokeContentProvider` directly from `packages/dashboard`:

- `packages/dashboard/lib/chad-dba/{leads,beeper,reports,ai-answer,path-resolver,client}.ts`
- `packages/dashboard/lib/form-storage.ts` (its own inline
  `invokeContentProvider`)

Confirmed **zero live importers** anywhere in `app/`/`lib/` (checked every
import path, incl. relative forms) — every real API route
(`app/api/**/route.ts`) imports business functions from the real `"dba"`
package, e.g. `app/api/views/route.ts` imports
`{ getAllDailyEntries, getAllDateEntries, ... } from "dba"`. Git history
traced this duplicate to the original `4ff194f Initial chad monorepo
skeleton` commit — leftover from before imports were rewritten onto the
real `dba` workspace package, never deleted. **Fixed: both deleted**
(`rm -rf lib/chad-dba lib/form-storage.ts`); `packages/dashboard` still
typechecks clean (`npx tsc --noEmit`, 0 errors) with them gone, confirming
they were truly dead.

`packages/console` re-exports `invokeContentProvider` from `dba` in
`contentProviderClient.ts` (a thin re-export layer, not a duplicate
implementation) — one console-only one-off script
(`openai/askOpenAiAboutGirl.ts`) calls it directly for a single raw write,
which is a minor layering shortcut in an admin CLI script, not a
Dashboard-facing violation; left as-is (out of this audit's scope, which
Input 1/the current ask both frame as "Dashboard").

No direct `new MongoCpProvider`/`new LegacyContentProviderAdapter` usage
was found outside `data-router-instance.ts` (the parked router
infrastructure itself) and each provider's own test file.

## Layer B — per-function migration status

Legend: ✅ dual-backend (`if (mongoEnabled)` / `if (contentProviderEnabled)`
implemented with a real Mongo path) · ❌ still Content-Provider-only (no
Mongo path exists) · N/A pure function/helper, no data access, or
Mongo-native feature with no CP equivalent by design.

### `leads.ts`

| Function | Status |
|---|---|
| `getAllDateEntries` | ✅ |
| `getAllDailyEntries` | ✅ |
| `saveDateEntry` | ✅ |
| `saveDailyEntry` | ✅ |
| `updateDailyEntry` | ✅ |
| `updateDateEntry` | ✅ |
| `getStatusLocaFromItem`, `generateWorkoutName`, `generateEntryName`, `computeDailyAutoFieldsByDate`, `hasField`, `parseStatusBody`, `getYamlFieldValue`, `isValidDateFolderName` | N/A (pure) |
| `GetAllLeads`, `GetLeadByName`, `TodoLeads`, `createStatusForLead`, `findStatusForLead`, `getLeadContactsByLoca`, `putStatusContent`, `getStatusItem`, `postItemByNames`, `ensureBeeperContactPath`, `saveBeeperContactContent`, `saveBeeperWhatsappConversation`, `createBeeperContact`, `getAllLeadNames`, `getLeadContacts`, `getLeadContactsItem`, `getAllLeadsWithContacts`, `getLeadsParentItem`, `getLeadDetails`, `createMsgWorkoutForLead`, `getLeadMsgWorkoutsByLoca`, `ensureLeadSubItems`, `ensureAllLeadsSubItems`, `getLeadDetailsWithWorkouts`, `getTodoMsgLeads`, `getFirstMsgLeads`, `getMsgWorkoutForEdit`, `saveMsgWorkout`, `leadExists`, `createLead`, `getMsgPlannerDateFolders`, `getMsgPlannerBody`, `getMsgPlannerBodyForDate`, `saveMsgPlannerBody`, `generatePlanContent`, `createMsgPlannerDateFolder` | ❌ (35 functions — Leads, Statuses' CP write path, Msg Todo, Msg Planner, Msg Workout, Beeper-contacts-via-CP) |

### `beeper.ts` (legacy WhatsApp-via-CP reads, distinct from `beeper-crm.ts`)

| Function | Status |
|---|---|
| `GetBeeper`, `GetBeeperItemByName`, `chad_FindReportsByLeadName`, `getAllBeeperWhatsappLeads`, `getBeeperWhatsappConversation`, `getAllLeadsFromRepository`, `chad_FindConversationByLeadName` | ❌ (7 functions) |
| `parseAddressToRepoLoca`, `joinAddress`, `readBodyMap` | N/A (pure) |

### `beeper-crm.ts` (Beeper CRM — Mongo-native since its Story 72 build, never had CP data)

| Function | Status |
|---|---|
| all exported functions (contacts/channels/messages/timeline) | N/A — Mongo-only by design, no CP equivalent exists or is meant to; not a migration gap |

### `statuses-dashboard.ts`

| Function | Status |
|---|---|
| `getStatusesDashboardList`, `getLeadStatusEditor`, `saveLeadStatus`, `createLeadStatus` | ❌ (all read/write through `leads.ts`'s CP-only `putStatusContent`/`getStatusItem`) |
| `classifyStatus`, `migrateStatusFields`, `createDefaultStatusBody`, `parseStatusFields`, `serializeStatusFields`, `parseRange` | N/A (pure) |

### `report-entries.ts` (Views -> Reports)

| Function | Status |
|---|---|
| `getAllReportEntries`, `getReportEntryByLoca`, `createReportEntry`, `updateReportEntry` | ❌ (4 functions) |

### `reports.ts` (older, unrelated root-level `reports`/`GetReportByName` data — see `documentation/dba/features/report-entries.md`'s naming-collision note)

| Function | Status |
|---|---|
| `GetReports`, `GetReportByName` | ❌ (2 functions) |

### `ai-answer.ts`

| Function | Status |
|---|---|
| `SaveAiAnswerToMsgWorkout` | ❌ |
| `BuildNextAiBotName` | N/A (pure) |

### `path-resolver.ts`

| Function | Status |
|---|---|
| `chad_ResolveByNames`, `chad_ResolveLocaByNames`, `chad_GetLeadsLoca`, `chad_GetReportsLoca`, `chad_GetBeeperLoca`, `chad_GetLeadsStatuses` | ❌ (6 functions — internal path-resolution helpers other CP-only functions above depend on) |
| `chad_GetLocaFromAddress`, `chad_GetRelativeLoca`, `chad_GetFirstSegment` | N/A (pure) |

### `repo-access.ts` / `repo-context.ts`

Authorization/session-scoping, not a data-provider concern — out of scope
for this audit.

### `data-router.ts` / `data-router-instance.ts` / `data-outbox.ts` / `data-outbox-worker.ts` / `data-sync-diagnostics.ts`

The actual centralized provider-selection infrastructure from Story 72's
first pass — fully implements the target `if(mongoEnabled)`/
`if(contentProviderEnabled)` selection generically. **Currently unused by
any business function** (per Story 72's own report: the six `leads.ts`
functions above were deliberately simplified to inline `if`/`if` instead of
routing through this layer). Kept in the codebase, still tested, for a
future function that needs outbox durability/shadow-reads rather than a
plain independent read of both backends.

## Totals

- ✅ fully migrated: **6** functions (all in `leads.ts`, the Daily/Date Entry pair this Story targeted).
- ❌ Content-Provider-only, no Mongo path yet: **55** functions across `leads.ts` (35), `beeper.ts` (7), `statuses-dashboard.ts` (4), `report-entries.ts` (4), `reports.ts` (2), `ai-answer.ts` (1), `path-resolver.ts` (6).
- N/A: pure helpers, and `beeper-crm.ts` (Mongo-native by design).

## What this means

Migrating all 55 remaining functions to the dual-backend pattern is
**not** a small follow-up — it's per-feature Story-scale work (Leads,
Statuses, Msg Todo, Msg Planner, Msg Workout, Reports, legacy
WhatsApp-via-CP), each needing its own Mongo schema/shape decision, a real
migration of that feature's existing CP data, and the same kind of
real-data verification this Story did for Daily/Date Entry — most of these
features have **no Mongo data at all** yet. This matches Story 72's own
report, which explicitly named "rewiring any existing `dba` business
function onto the new pattern" as deliberately out of scope, "a natural
next Story."
