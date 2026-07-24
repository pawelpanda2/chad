# Story 84 — Message Creator GUI — Plan

Status: **ACCEPTED — implemented (Story 84). Mentor prompts remain a follow-up Story.**

## 1. Current state audit (reuse only)

Already exists and must be reused, not duplicated:

| Capability | Where | Notes |
|---|---|---|
| Session + `runWithRepoContext` | Dashboard API routes | Pattern for all new routes |
| WhatsApp conversation fetch | `getBeeperWhatsappConversation` + `GET /api/beeper/conversation/[leadName]` | Docs still mention `?lead=` — **code uses dynamic segment** (prefer code) |
| Conversation finder used by Console | `chad_FindConversationByLeadName` | Richer result (`body`, `channel`, `error`); Creator should prefer this (or wrap both behind one DBA helper) |
| Report finder | `chad_FindReportsByLeadName` → `ReportResult[]` | Console already uses it; Dashboard does not yet expose a thin route for lead reports |
| Msg workout list/create/edit | `leads.ts` + `/dashboard/leads/msg-workout` + lead details | Keep as classic document editor |
| Console → OpenAI → save | `askOpenAiAboutGirl.ts` + `SaveAiAnswerToMsgWorkout` | Creates `YY-MM-DD; ai bot` Text items — **leave intact** |
| Shared editor / shells | `TextEditorWithToolbar`, `EditorPageShell`, `DashboardPageShell`, `NavGroup` | Use for proposals / improve input; do not invent a parallel editor |
| Bubble parser UI | **inline** in `messages/page.tsx` (`parseWhatsAppMessages`) | Must be extracted to a shared component |

Not found in code: a `//you` convention as an implemented parser. Prompt mentions it as a possible historical pattern — plan treats it as **best-effort import**, not as the primary store.

## 2. Recommended entry point

**New route:** `/dashboard/leads/message-creator`

Query params (same family as msg-workout):

```
?leadName=…&leadLoca=…
```

Optional: `&workoutLoca=…&workoutName=…` when opened from a specific workout context (defaults: ensure/create today's working session folder under `msg workout` if needed for analysis docs).

**Why not replace `/dashboard/leads/msg-workout`:**
- Existing page is a single-document Preview/Editor for historical Text items (`26-07-09`, `26-07-09; ai bot`, etc.).
- Message Creator is a multi-pane workflow (conversation + two-level tabs + AI actions).
- Merging would regress the classic editor and tangle unrelated UX.

**Navigation:**
- Lead details → primary CTA **Open Message Creator** (English).
- Existing workout links keep opening classic `/leads/msg-workout`.
- Message Creator may show a compact “Open related workouts” list linking to classic editor (no second editor implementation).

## 3. Information architecture

### Header (always)

- Lead title (`leadName`)
- Conversation source status: `Loaded` / `No conversation found` / error
- Optional channel label if available from DBA finder

### Approach context (not a Level-1 tab)

Collapsible section **above** Level-1 tabs in the right pane:

- Label: **Approach context**
- Textarea ~3–5 sentences
- Save / Saved
- Persisted per lead (see §6)
- Rationale: used later by Capital/AI; must be visible regardless of You vs school tab; a Level-1 tab would bury it and duplicate “You”.

### Level 1 — perspective source

| Tab label | Full title when selected | Role |
|---|---|---|
| **You** | You | User materials |
| **SD-PL** | Social Dynamics Poland | First configured school |
| *(dynamic)* | `school.fullName` | Future schools from config |

Level-1 tabs are driven by `listMessageCreatorPerspectives()` = fixed `You` + enabled schools sorted by `order`.

### Level 2 — under You

| Tab | Content | Empty state |
|---|---|---|
| **My Proposals** | Shared editor for user proposals; Save/Saved | **No proposals yet** |
| **My Reports** | Auto-found reports list; click opens report | **No reports found** |

### Level 2 — under each school (identical contract)

| Tab | Display | Empty / idle states (never fake scores) |
|---|---|---|
| **Conversation Health** | Score 1–10 when analyzed; else **Not analyzed yet**; if hash mismatch **Outdated** | No default “7” |
| **Capital** | Current value + delta vs previous run; else Not analyzed yet / Outdated / **No data** | |
| **Next Message** | Proposal text + school badge; **Copy** / **Save** (persist run) | Not analyzed yet |
| **Improve** | User input editor + AI result panel (separate fields) | Not analyzed yet |

### Global school action (not a 5th Level-2 tab)

Toolbar button: **Analyze Full Conversation**

- Visible whenever a school (not You) is selected
- Opens/fills a result panel (drawer or inline result card under Level-2) with: summary, main strengths, main mistakes, recommendations
- Same persistence model as other AI ops (`full-analysis`)

## 4. Responsive layout

### Desktop (`md+`)

```
┌─────────────────────────┬──────────────────────────┐
│ Conversation (~45–50%)  │ Message Creator (~50–55%)│
│ own overflow-y scroll   │ own overflow-y scroll    │
└─────────────────────────┴──────────────────────────┘
```

- Recommendation: **fixed ~48/52** via CSS grid (`grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]`) for v1.
- Resizable split is a nice-to-have follow-up (extra state/a11y); not required to ship IA.
- Outer shell: `EditorPageShell` + no page-level scrollbar (`overflow-hidden`), matching responsive-layout-standard.

### Mobile / narrow

- Stacked: Conversation **above**, Creator **below**
- Each pane keeps independent scroll (`min-h-0 overflow-y-auto`)
- Level-1/Level-2 tabs wrap (`flex-wrap`) like existing toolbars

### Unsaved draft rule

- Keep My Proposals and Improve input in React state keyed by `leadLoca`
- Changing Level-1/2 tabs must **not** discard unsaved drafts
- Warn only on navigation away from Message Creator if dirty (optional v1: dirty flag + `beforeunload`)

## 5. Reusable components

Extract / add:

1. **`BeeperConversationView`** — move parser + bubbles from `messages/page.tsx`; Messages page imports it (no behavior change).
2. **`MessageCreatorShell`** — two-pane / stacked layout wrapper.
3. **`PerspectiveTabs` + `SchoolSubTabs`** — data-driven; school tabs rendered from config array.
4. **`AnalysisStatusBadge`** — `Not analyzed yet` | `Current` | `Outdated` | `No data` | `Error`.
5. Reuse **`TextEditorWithToolbar`** for My Proposals and Improve input.
6. Reuse existing report open pattern from Views/Reports if a report viewer route already exists; otherwise link to Views reports entry by loca/name via thin DBA open helper — **no client-side CP traversal**.

## 6. Data model

All under the **current user’s repo** (`runWithRepoContext`). Paths are logical names under the lead:

```
leads / all items / {leadName}/
  contacts
  approach context          ← NEW Text (find-or-create); body = plain text
  msg workout/              ← existing Folder
    my proposals            ← NEW Text (find-or-create); body = user proposals
    YY-MM-DD                ← existing human workouts (untouched)
    YY-MM-DD; ai bot        ← existing Console AI answers (untouched)
    YY-MM-DD; {school}; {op}[; {suffix}]  ← NEW analysis run Text items
```

### Approach context

- Item name: `approach context`
- Body: free text
- Scope: **per lead** (not per workout)

### My Proposals (decision)

**Primary store:** dedicated Text child `my proposals` under `msg workout`.

**Why not edit `//you` inside historical AI/workout docs:**
- Avoids accidental overwrite of AI answers
- Clear Save semantics
- No destructive migration

**Compatibility / soft import (no migration write):**
- On first load, if `my proposals` empty, DBA may **read-only scan** existing msg-workout Text bodies for a line/section starting with `//you` (if present) and return `importedFromHistorical: true` + suggested text for the UI to offer “Use imported text” — **does not write** until user saves.
- Old items never rewritten by this Story.

### My Reports

- Not stored in Creator; always live query via `chad_FindReportsByLeadName(leadName)`.
- UI lists `name`, `category`, open by address/loca through existing report APIs if available, or add thin `getReportForCreator(address)` in DBA.

### School definition (config, not CP initially)

```ts
interface MessageCreatorSchool {
  id: string;          // stable slug, e.g. "sd-pl"
  tabLabel: string;    // "SD-PL"
  fullName: string;    // "Social Dynamics Poland"
  order: number;
  enabled: boolean;
  // Reserved for later Stories — unused now:
  promptRef?: { preparedPromptId?: string; version?: string };
  modelRef?: string;
}
```

Seed: one enabled school `sd-pl`. Adding a school = config entry only (no new page/routes).

### Analysis run document

Logical name pattern:

```
{yy-MM-dd}; {schoolId}; {operation}
```

`operation` ∈ `health | capital | next-message | improve | full-analysis`

Collision suffix: `b`, `c`, … (same idea as `BuildNextAiBotName`, generalized).

Body: structured text (YAML front-matter + markdown sections), minimum fields:

```yaml
schemaVersion: 1
schoolId: sd-pl
operation: health
createdAt: ISO-8601
conversationHash: sha256-hex
conversationChannel: whatsup|…
leadName: …
userInput: |   # only for improve; else omit
  ...
status: complete
```

Then sections for the AI payload (score, capital, delta, message, improve critique, full-analysis blocks). **Never invent scores in UI** when no document exists.

### Conversation freshness

- `conversationHash = sha256(rawConversationBody)` computed in DBA when saving a run and when loading Creator bootstrap.
- Latest run per `(schoolId, operation)` compared to current hash:
  - equal → `Current`
  - differ → `Outdated`
  - no run → `Not analyzed yet`
- **No auto AI on mount/render.** User must click Analyze / Refresh.
- History preserved by always creating **new** Text items (append-only naming).

## 7. DBA public API (proposed)

New module e.g. `packages/dba/src/message-creator.ts` (exported from `index.ts`):

| Method | Responsibility |
|---|---|
| `listMessageCreatorSchools()` | Seeded/config schools (enabled sorted) |
| `getMessageCreatorBootstrap(leadName, leadLoca)` | approach, proposals, reports summary, conversation meta+hash, latest analysis statuses per school/op |
| `getOrCreateApproachContext(leadLoca)` / `saveApproachContext(leadLoca, text)` | per-lead Text |
| `getOrCreateMyProposals(leadLoca)` / `saveMyProposals(leadLoca, text)` | under msg workout; soft-import hint only |
| `listLeadReportsForCreator(leadName)` | wraps `chad_FindReportsByLeadName` |
| `getLeadConversationForCreator(leadName)` | wraps finder; returns `{ body, channel, hash, error? }` |
| `listAnalysisRuns(leadLoca, filters?)` | children of msg workout matching creator naming |
| `getLatestAnalysisRun(leadLoca, schoolId, operation)` | + freshness vs provided/current hash |
| `saveAnalysisRun(input)` | **new general saver** (do **not** overload `SaveAiAnswerToMsgWorkout`) |
| `runMessageCreatorAiAction(input)` | server-side OpenAI boundary; persists via `saveAnalysisRun`; returns structured result **or** explicit `PROMPT_NOT_CONFIGURED` |

Keep `SaveAiAnswerToMsgWorkout` for Console unchanged.

## 8. Next.js API routes (thin)

| Route | Methods | Notes |
|---|---|---|
| `GET /api/leads/message-creator` | bootstrap | query: `leadName`, `leadLoca` only; session → `runWithRepoContext` |
| `PUT /api/leads/message-creator/approach` | save approach | body: `{ leadLoca, text }` |
| `PUT /api/leads/message-creator/proposals` | save proposals | body: `{ leadLoca, text }` |
| `GET /api/leads/message-creator/conversation` | optional if not in bootstrap | or reuse existing beeper conversation route |
| `POST /api/leads/message-creator/ai` | **one** AI actions endpoint | body: `{ leadName, leadLoca, schoolId, operation, userInput?, force? }` |

Forbidden: `repoGuid` from client; OpenAI key in client; CP calls in React.

Reuse `GET /api/beeper/conversation/[leadName]` for conversation pane if bootstrap prefers lighter payload; hash computed server-side either way.

## 9. OpenAI boundary (contract only — no prompts in this Story)

**Execution location:** DBA/`runMessageCreatorAiAction` only (Dashboard route → DBA). Console flow remains separate.

**Input (conceptual):**

```ts
{
  schoolId: string;
  operation: "health"|"capital"|"next-message"|"improve"|"full-analysis";
  leadName: string;
  conversationBody: string;
  conversationHash: string;
  approachContext?: string;
  reports?: Array<{ name: string; body: string }>;
  userInput?: string; // improve
}
```

**Output (conceptual):** typed object per operation + always persisted as analysis run when `complete`.

Until mentor prompts exist: return `{ status: "PROMPT_NOT_CONFIGURED" }` and UI shows **No data** / Try Again — **not** placeholder scores.

## 10. Compatibility

| Asset | Policy |
|---|---|
| `YY-MM-DD; ai bot` | Never rename/migrate/overwrite |
| Classic msg-workout editor | Unchanged |
| Messages page | Only import shared conversation view |
| Console Ask OpenAI | Unchanged; still uses `SaveAiAnswerToMsgWorkout` |
| Historical `//you` | Soft import into empty proposals only |
| `msg workout` folder missing | Creator find-or-creates Folder via existing lead helpers (same as create workout) |

## 11. School extensibility

- GUI loops `schools.filter(s => s.enabled).sort(by order)`.
- One shared `SchoolWorkspace` component; `schoolId` is a prop.
- One AI route; `schoolId` selects future `promptRef` inside DBA.
- Enabling school #2 = config change + (later) prompt mapping — **zero** page clones.

## 12. Conversation freshness (summary)

| Event | Behavior |
|---|---|
| Open Creator | Load conversation + hash; compare to latest runs; show badges |
| New Beeper messages (hash change) | Mark prior runs **Outdated**; do not call AI |
| User clicks Analyze / Refresh | Call AI once; save new run; badge → Current |
| React re-render / tab switch | No AI |

Recommended v1 strategy: **manual refresh only**. Auto-on-open and event-driven updates are follow-ups after prompts exist (cost control).

## 13. Security and isolation

- Every route: `getCurrentUserFromCookies()` → 401 `NOT_AUTHENTICATED` → `runWithRepoContext(user, …)`
- No trust of client `repoGuid`
- OpenAI key only in server env
- Schools/proposals/approach/analysis live in the user’s own CP repo (same isolation model as leads)

## 14. Implementation sequence (verifiable stages)

| Stage | Deliverable | Verify without full AI |
|---|---|---|
| **A** | Route shell + lead header + two-pane layout + shared conversation view | Desktop side-by-side; mobile stack; Messages regression |
| **B** | Approach context save/load | Reload page restores text |
| **C** | Level-1 You/SD-PL + Level-2 You (proposals + reports) | Empty states; save proposals; reports list; English copy |
| **D** | School Level-2 UI + status badges + Analyze Full Conversation button | Shows Not analyzed yet; no fake scores |
| **E** | `saveAnalysisRun` + bootstrap latest/outdated | Manual fixture Text item appears as Current/Outdated |
| **F** | Single AI route returning `PROMPT_NOT_CONFIGURED` | Try Again; no client secrets |
| **G** | Tests + human-docs feature note | Checklist scenarios |

Prompt/mentor wiring = **separate Story** after acceptance of this IA.

## 15. Tests

**Unit (dba):**
- school list order/enabled
- analysis name builder + suffix
- conversationHash stability
- freshness Current vs Outdated
- proposals soft-import does not write
- `BuildNextAiBotName` / Console saver untouched

**Integration (API):**
- 401 without session
- user A cannot read user B lead via Creator routes
- proposals PUT → GET round-trip
- AI POST without prompt → explicit not-configured, no fake body scores

**UI / manual:**
- all scenarios listed in §16
- English-only user-facing strings
- independent scrolls desktop/mobile
- tab switch keeps unsaved proposals draft

**Regression:**
- `/dashboard/leads/msg-workout` save still works
- `/dashboard/messages` conversation still loads

## 16. Required scenarios (acceptance matrix)

1. Lead with conversation + reports + workouts  
2. Conversation, no report → **No reports found**  
3. No conversation → **No conversation found**  
4. No msg workout folder → Creator creates needed structure without breaking lead  
5. Old workout with `//you` → soft import available; originals intact  
6. Old workout without `//you` → **No proposals yet**  
7. Save My Proposals → reload shows text  
8. Saving proposals never overwrites `; ai bot` items  
9. Switch You ↔ SD-PL keeps unsaved proposals draft  
10. Add second school in config → second Level-1 tab, same Level-2, no new page  
11. Selecting SD-PL shows full title **Social Dynamics Poland**  
12. All new UI strings English  
13. User A ≠ User B data  
14. Conversation change → previous health/capital **Outdated**  
15. Re-render does not call AI  
16. Mobile stacked independent scrolls  
17. Classic Msg Workout + Messages unchanged  

## 17. Open decisions (with recommendation)

### D1 — Entry route

**Recommendation:** New `/dashboard/leads/message-creator` (do not replace classic msg-workout).  

### D2 — My Proposals storage

**Recommendation:** Dedicated Text item `my proposals` under `msg workout` + optional read-only `//you` soft import; no destructive migration.  

### D3 — Split pane

**Recommendation:** Fixed ~48/52 grid for v1; defer drag-resize.  

(If any of D1–D3 is rejected, adjust Stage A/C before coding.)

## 18. Out of scope (explicit)

Mentor prompt text; SD-PL prompt config; capital theory; model selection; auto-send to Beeper; Beeper CRM rebuild; destructive historical migration; deploy TEST/PROD; any application code in this planning session.
