# Story 85 — Tasks and checklist

## Tasks

### T1 — Story folder + plan
Create Story 85 docs from user mockup prompt.

### T2 — DBA: stable messages + prompt versions + message-level runs
Pure WhatsApp parse/IDs; prompt version & model lists; option builder;
schema v2 analysis runs; bootstrap counts; Send new boundary.

### T3 — API thin adapters
Extend GET bootstrap; POST AI with targetMessageId / promptVersionId / modelId;
keep PUT approach/proposals.

### T4 — BeeperConversationView
Action column slot, selection highlight, optional context frame, mini mode
without comboboxes.

### T5 — Message Creator UI
Beeper/Analysis modes per mockup + clarifications; proposals; approach dialog;
resizable analysis side panel ±50px.

### T6 — Tests, human-docs, local smoke, commit
Unit tests for IDs/options/frame; typecheck; local deploy; browser smoke;
commit only Story 85 files.

## Checklist

- [ ] UI has only Beeper / Analysis modes; active mode is black
- [ ] Top prompt select hidden until message selected; Analysis disabled until concrete version
- [ ] Single option source for row + top combobox; Open (N) sum; sort + zeros; no combobox if sum 0
- [ ] Beeper full width; no right panel; no “Full Beeper conversation” header
- [ ] Analysis panel ~36% ±50px; conversation half + model/Send new/runs
- [ ] Red context frame only (no extra labels); frame scope per rules
- [ ] Sections: Recommended directions, Mistakes, Proposal score, Previous messages score
- [ ] Proposals: You + dynamic versions; Send left; Save/msg; draft survives mode switch
- [ ] No AI on mount; no fake scores; Send proposal not faked
- [ ] Legacy runs readable; no destructive migration
- [ ] Unit tests + local runtime smoke
- [ ] human-docs + Story updated; logical commit (no foreign WIP)
