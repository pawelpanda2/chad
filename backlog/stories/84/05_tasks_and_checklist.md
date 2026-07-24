# Story 84 — Tasks and checklist

Functional tasks for implementation **after** plan acceptance. Ai Status starts NOT DONE; Real Status left blank for human verification.

| # | Ai Status | Real Status | Task |
|---|-----------|-------------|------|
| 1 | NOT DONE | | Message Creator route shell + lead entry point |
| 2 | NOT DONE | | Extract shared Beeper conversation view; embed in Creator |
| 3 | NOT DONE | | Responsive two-pane / stacked layout with independent scrolls |
| 4 | NOT DONE | | Approach context load/save (per lead) |
| 5 | NOT DONE | | Level-1 perspectives (You + dynamic schools; SD-PL full title) |
| 6 | NOT DONE | | You → My Proposals (dedicated item + soft //you import) |
| 7 | NOT DONE | | You → My Reports (DBA finder, empty state, openable) |
| 8 | NOT DONE | | School Level-2 tabs UI + status badges (no fake scores) |
| 9 | NOT DONE | | Analyze Full Conversation action UI + result surface |
| 10 | NOT DONE | | DBA analysis-run model + `saveAnalysisRun` + freshness hash |
| 11 | NOT DONE | | Thin API routes (bootstrap, approach, proposals, single AI) |
| 12 | NOT DONE | | OpenAI boundary stub (`PROMPT_NOT_CONFIGURED`) server-side only |
| 13 | NOT DONE | | English user-facing copy audit |
| 14 | NOT DONE | | Isolation/security pass on all new routes |
| 15 | NOT DONE | | Automated + manual regression matrix (§16 in plan) |
| 16 | NOT DONE | | human-docs feature note for Message Creator |

---

## Task 1 — Message Creator route shell + lead entry point

**Requested:** Dedicated Creator entry without replacing classic msg-workout editor.  
**Plan:** Add `/dashboard/leads/message-creator?leadName&leadLoca`; CTA from lead details (“Open Message Creator”).  
**Done when:** Route renders shell with lead title; classic workout links still open old editor.  
**Status:** NOT DONE

## Task 2 — Extract shared Beeper conversation view

**Requested:** Reuse existing conversation parser/rendering; no second parser.  
**Plan:** Extract `parseWhatsAppMessages` + bubbles from `messages/page.tsx` into `BeeperConversationView`; Messages imports it. Creator loads via existing conversation API / DBA finder.  
**Done when:** Messages behavior unchanged; Creator shows same bubbles for same lead.  
**Status:** NOT DONE

## Task 3 — Responsive layout

**Requested:** Desktop conversation beside creator; mobile stacked; independent scrolls.  
**Plan:** `EditorPageShell` + ~48/52 grid on `md+`; stacked below; no page-level scrollbar.  
**Done when:** Manual check desktop/mobile matches plan §4.  
**Status:** NOT DONE

## Task 4 — Approach context

**Requested:** 3–5 sentence form, per lead, reloadable; not a main Level-1 tab.  
**Plan:** Collapsible section above Level-1; CP Text `approach context` under lead; DBA get/save.  
**Done when:** Save → reload restores text; English labels.  
**Status:** NOT DONE

## Task 5 — Level-1 perspectives + school model

**Requested:** You | SD-PL | future schools; SD-PL shows “Social Dynamics Poland”; configurable school model.  
**Plan:** Seeded `MessageCreatorSchool[]` in DBA; UI data-driven; SD-PL first enabled school.  
**Done when:** Second school can be enabled via config without new page code.  
**Status:** NOT DONE

## Task 6 — My Proposals

**Requested:** Show/edit/save proposals; no AI overwrite; old workouts safe; decide storage.  
**Plan:** Text `my proposals` under `msg workout`; soft read-only `//you` import if empty; never rewrite `; ai bot`.  
**Done when:** Round-trip save; historical AI docs unchanged.  
**Status:** NOT DONE

## Task 7 — My Reports

**Requested:** Auto-found reports; no paste; clickable; empty state; use DBA search.  
**Plan:** Wrap `chad_FindReportsByLeadName` in Creator bootstrap/API; **No reports found**.  
**Done when:** Lead with/without reports matches scenarios 1–2.  
**Status:** NOT DONE

## Task 8 — School Level-2 tabs + badges

**Requested:** Health / Capital / Next Message / Improve; distinguish missing vs real analysis; no fake 7/10.  
**Plan:** Shared `SchoolWorkspace`; badges Not analyzed yet / Current / Outdated / No data.  
**Done when:** All four tabs render idle states correctly before AI exists.  
**Status:** NOT DONE

## Task 9 — Analyze Full Conversation

**Requested:** Visible action (not 5th tab); summary/strengths/mistakes/recommendations; stored as document.  
**Plan:** Toolbar button; result card; operation `full-analysis` via same saver.  
**Done when:** Button visible on school perspective; idle/error states English.  
**Status:** NOT DONE

## Task 10 — Analysis runs + freshness

**Requested:** Versioned AI docs with school/op/time/input/hash; mark stale after new messages; no AI on every render.  
**Plan:** Naming `{date}; {school}; {op}`; sha256 conversation hash; append-only saves; compare on bootstrap only.  
**Done when:** Fixture run shows Current then Outdated after hash change without calling AI.  
**Status:** NOT DONE

## Task 11 — Thin API routes

**Requested:** Dashboard → thin route → DBA; prefer one AI endpoint.  
**Plan:** bootstrap GET; approach/proposals PUT; single `POST .../ai`.  
**Done when:** Routes contain no CP traversal / no business branching beyond parse+call.  
**Status:** NOT DONE

## Task 12 — OpenAI boundary stub

**Requested:** Server-side only; no prompt engineering this Story; no fake answers.  
**Plan:** `runMessageCreatorAiAction` returns `PROMPT_NOT_CONFIGURED` until later Story; UI Try Again / No data.  
**Done when:** Network tab shows no OpenAI key; client bundle has no secrets.  
**Status:** NOT DONE

## Task 13 — English UI copy

**Requested:** Listed strings and all new user-facing text in English.  
**Plan:** Copy checklist against plan §3 / input §4.7.  
**Done when:** Spot-check Creator UI has no Polish user strings.  
**Status:** NOT DONE

## Task 14 — Isolation / security

**Requested:** Cookies session; 401; `runWithRepoContext`; no client repoGuid.  
**Plan:** Mirror msg-workout/beeper route pattern; negative test user A/B.  
**Done when:** Unauthenticated 401; cross-user access blocked.  
**Status:** NOT DONE

## Task 15 — Test matrix

**Requested:** Scenarios in prompt §11 / plan §16 including regressions.  
**Plan:** Unit for naming/hash/freshness; API integration; manual UI matrix.  
**Done when:** Checklist scenarios recorded as pass/fail in this file during implementation.  
**Status:** NOT DONE

## Task 16 — Documentation

**Requested:** Keep project docs accurate after feature ships.  
**Plan:** Add `human-docs/dashboard/leads/features/message-creator.md` (+ index pointer if required by what-and-where conventions).  
**Done when:** Doc matches shipped routes/model.  
**Status:** NOT DONE
