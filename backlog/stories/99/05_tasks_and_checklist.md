# Story 99 — Tasks & checklist (Cursor resume)

## CURSOR_START_SHA

```
CURSOR_START_SHA=6de07ca37fea72ae885c0d96f2f452ba9c6cf17c
```

Local tag: `cursor-start-msg-workout`

Return (user only, on request):

```
git reset --hard 6de07ca37fea72ae885c0d96f2f452ba9c6cf17c
```

## FINAL_SHA

```
FINAL_SHA=68914e3ab908eed8dd35034cb43e0230f7017ae3
```

Feature commit: `3dc52ebf00e84e64d1b35311ac04d0436be88cda`

## Baseline TS errors (pre-Cursor fix)

- `msg-workout-review-view.tsx`: `allWorkouts` missing in `EMPTY_WORKOUT_LINKS`
- `msg-workout-review-view.tsx`: `setWorkoutLinks` payload missing `allWorkouts`
- Prompt's `set-link` Expected-4-args was already fixed in WIP (5-arg `setMsgWorkoutMessageAssignment`)

## Decisions

- **Numbering:** `1` = first message in display order (top → bottom). GUI-only; persist uses Mongo `dbId`.
- **Assign / reassign / unlink:** `PATCH /api/msg-workout/set-link` → `setMsgWorkoutMessageAssignment` → `setMsgWorkoutBeeperLinkManual` (`messageId: null` unlinks).
- **Proposal:** combobox value only reflects confirmed link; suggested number marked `*`; user must select to confirm.
- **you/she:** unchanged — `isOwn` right, other left; action column sits in the empty side.

## Checklist

- [x] Checkpoint commit
- [x] Fix allWorkouts contract
- [x] Wire MsgWorkoutAssignmentList
- [x] Message numbers + dbId mapping helpers + tests
- [x] Manual link assign/reassign/unlink unit tests
- [x] Main shell scroll after conversation select (rAF, contact-keyed)
- [x] DBA/Dashboard typecheck + build
- [x] Local Docker official deploy (dashboard up; known unrelated `12040` FATAL warning)
- [x] Browser smoke PASS LOCAL (numbers, empty assignment list, shell scroll, no console errors)
- [ ] Full assign/reassign on real lead workout — BLOCKED (test3 had no linked lead/msg workouts; API validation path checked)
- [x] Final commit + FINAL_SHA + push

