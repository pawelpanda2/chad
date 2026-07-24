# Story 84 — Others from report

## Planning notes (not blockers)

1. **Two conversation helpers in DBA** (`getBeeperWhatsappConversation` vs `chad_FindConversationByLeadName`). Creator should expose one wrapper so Dashboard does not have to choose ad hoc; prefer the richer finder used by Console, with a clear fallback message when body is null.
2. **Resizeable split** deferred deliberately (plan D3) to keep Stage A small.
3. **Mentor prompts / capital theory / model choice** belong in a follow-up Story after this GUI+contract Story is accepted and Stage A–F land.
4. **Historical `SaveAiAnswerToMsgWorkout` creating `msg workout` as type Text** is a pre-existing quirk — do not “fix” as part of Creator unless a dedicated cleanup Story is approved; Creator path should use Folder semantics via lead helpers.
