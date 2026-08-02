# GUI integration — Beeper Conversations

## Where it lives

`packages/dashboard/components/beeper/beeper-conversations-view.tsx`
(Story 94's split-view). The right-hand `<section>` — the conversation pane
— is "the right panel" referred to below; there is no new route/page.

## The one hard rule

**The GUI never runs the matching engine.** It only ever reads what
`analyzeMsgWorkoutsForLead` already wrote, via
`GET /api/msg-workout/conversation-links?conversationId=...` →
`msg-workout-gui-data.ts`'s `getMsgWorkoutConversationLinks` — pure reads
of `config.links.beeper` + proposal-item existence, nothing computed at
render time.

## Marker

`msg-workout-marker.tsx` — rendered per message via
`BeeperConversationView`'s existing `renderMessageAction`/`showActions`
props (already built for Message Creator's AI-analysis action column, not
new plumbing). For each message, `beeper-conversations-view.tsx` looks up
`workoutLinks.linksByMessageId[msg.dbId]` (see `beeper-linking.md` for
`dbId`) and renders one compact chip per linked workout, or nothing at all
when the array is empty/absent — **no marker for messages without a
link**, and no marker without a `dbId` (only pre-parsed,
server-side-parsed messages carry one).

## Expanding a workout

Clicking a marker chip (or an Undated entry) sets `expandedWorkout` state
in `BeeperConversationsView` — `{ loca, name, body }`. While set,
`msg-workout-panel.tsx` renders **instead of** `BeeperConversationView`,
filling the same right-hand `<section>` at full height, with a close (✕)
button that clears the state and restores the normal conversation view. No
new route, no page navigation — a plain local React state swap.

## Undated section

`undated-msg-workouts.tsx` — a single-line strip
(`workoutLinks.undated`), rendered above the conversation, **only when
non-empty**. A workout is "Undated" when: its name doesn't parse as either
supported date shape (`parseWorkoutName` → `"none"`), it has no
`config.links.beeper`, and it has no existing proposal item yet (an
undated workout that already got a proposal — impossible today, since
`undated` names short-circuit before matching runs — is excluded
defensively). No descriptive copy, no card, doesn't cover the conversation
— just chips, same visual language as the marker.

## Triggering analysis

There is no automatic background job. A small "sync" icon button
(`Sparkles`, top-right of the conversation pane, only shown when a lead is
resolved for the open conversation) calls
`POST /api/msg-workout/analyze-lead { leadName }`, then refetches
`conversation-links`. This is the only UI path that ever calls the
matching engine — a deliberate, explicit, user-initiated action, never
triggered by opening/rendering a conversation.

## Data flow summary

```
open conversation → GET conversation-links (read-only)
                        │
                        ▼
              render markers + Undated from what's already there
                        │
              (optional) click "sync" → POST analyze-lead
                        │              (writes config.links.beeper / proposals)
                        ▼
                  GET conversation-links again → markers/Undated update
```
