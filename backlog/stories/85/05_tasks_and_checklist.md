# Story 85 — Tasks and checklist

## Tasks

### T1 — Story folder + plan — DONE
### T2 — DBA: stable messages + prompt versions + message-level runs — DONE
### T3 — API thin adapters — DONE
### T4 — BeeperConversationView — DONE
### T5 — Message Creator UI — DONE
### T6 — Tests, human-docs, local smoke, commit — DONE

## Checklist

- [x] UI has only Beeper / Analysis modes; active mode is black
- [x] Top prompt select hidden until message selected; Analysis disabled until concrete version
- [x] Single option source for row + top combobox; Open (N) sum; sort + zeros; no combobox if sum 0
- [x] Beeper full width; no right panel; no “Full Beeper conversation” header
- [x] Analysis panel ~36% ±50px; conversation half + model/Send new/runs
- [x] Red context frame only (no extra labels); frame scope per rules
- [x] Sections: Recommended directions, Mistakes, Proposal score, Previous messages score
- [x] Proposals: You + dynamic versions; Send left; Save/msg; draft survives mode switch
- [x] No AI on mount; no fake scores; Send proposal not faked
- [x] Legacy runs readable; no destructive migration
- [x] Unit tests + local runtime smoke
- [x] human-docs + Story updated; logical commit (no foreign WIP)

## Runtime smoke (local `260725_005647`)

- Logged in as `test3`
- Msg Auto shows **CREATOR** after **BEEPER**
- Lead picker + opened `26-07-25_pn_Smoke` (fixture lead created for smoke)
- Beeper active; Analysis disabled; no top prompt select without message
- Save msg / Message proposals / Approach / Reports present
- Bootstrap returns `promptVersions`, `models`, `messageRunCounts`, `allRuns`, `messages`
- Unit: whatsapp-messages 7/7, message-creator 10/10; dashboard typecheck OK
