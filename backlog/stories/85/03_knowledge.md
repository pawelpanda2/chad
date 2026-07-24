# Story 85 — Knowledge

## Entry docs used

- `ai-docs/begin_here/01_ai_start.md` → `03_story-standard.md`, `05_endpoint-rules.md`
- `human-docs/dashboard/leads/features/message-creator.md` (Story 84)
- `backlog/stories/84/` (implemented baseline)
- Mockup: `examples/chad_message_creator_two_level_layout_mockup_v12.html`

## Context frame rules (acceptance)

- Target = last **she** message → red frame = consecutive trailing **she** streak
  ending at target.
- Target = **you** message → red frame = previous consecutive **she** streak
  immediately before target, plus the target **you** message.
- No extra labels (“Messages included…”) — frame only.

## Analysis unlock

1. Default: Beeper active; Analysis disabled; top prompt select hidden.
2. Click message → selected; top select visible (same options as row); Analysis
   still disabled.
3. Choose concrete version (not Open) from top **or** row select → Analysis
   enabled; same open path.
4. `Open (N)` = browse history only; does not unlock Analysis / does not call AI.

## Resize

Default right panel ~36%. Drag handle ±50px from that default width only.
