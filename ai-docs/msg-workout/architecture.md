# Architecture — msg workout ↔ Beeper linking (Story 99)

## Data sources

Two completely separate stores, tied together only by `dba`:

```
leads/all items/<leadName>/msg workout/<workoutName>   — Content Provider (Postgres-backed)
beeper_<repoGuid>.messages                             — Beeper Mongo, one db per user
```

Neither side knows about the other natively — a workout Text item's
`config.links.beeper` (see `beeper-linking.md`) is the only place the two
are tied together, and it lives entirely on the CP side (the Mongo message
document is never modified).

## Layering

```
Dashboard GUI (components/beeper/*)
        │  fetch()
        ▼
Next.js API routes (app/api/msg-workout/**)  — thin adapters only
        │  runWithRepoContext(user, ...)
        ▼
packages/dba
  msg-workout-matching.ts   — pure, no I/O
  msg-workout-linking.ts    — config.links.beeper read/write (item-ops.ts)
  msg-workout-proposals.ts  — links/msg workout/<lead> CP tree (item-ops.ts)
  msg-workout-analyze.ts    — orchestrates the two above + reads:
    leads.ts                — getLeadMsgWorkoutsByLoca, getAllLeadsWithContacts
    lead-beeper-links.ts    — listLeadBeeperLinks, findLiveBeeperMatchForLead (read-only)
    beeper-crm.ts           — getBeeperContact (Beeper Mongo messages)
  msg-workout-gui-data.ts   — read-only aggregation for the GUI
        │
        ▼
Content Provider (Postgres primary)     Beeper Mongo (beeper_<repoGuid>)
```

Every rule from `ai-docs/begin_here/05_endpoint-rules.md` applies: no CP
address/loca details leak past `dba`, no direct Mongo access from the
Dashboard, API routes never contain matching/business logic.

## Why no new backend/collection

- The link itself (`config.links.beeper`) is a free-form key on the
  workout's own CP item config — `CpItemConfig` already allows arbitrary
  keys (`cp-model.ts`). No schema migration, no new table.
- Proposals reuse the existing "logical CP folder chain" pattern every
  other feature in this repo already uses (e.g. `views/dates`,
  `views/daily`) — `findOrCreateFolderChain(["links", "msg workout",
  leadName])` via `item-ops.ts`. Physical folders stay numeric; the
  `links`/`msg workout`/`<leadName>` names live in each folder's own
  `config.name`, never as a literal filesystem path.

## Why the lead↔conversation resolution is read-only here

Story 90's `lead_conversation_links` Mongo collection (one lead ↔ one whole
conversation) is the existing source of truth for "which Beeper
conversation belongs to this lead." This Story's `resolveConversationIdForLead`
(`msg-workout-analyze.ts`) and `findLeadForConversation`
(`msg-workout-gui-data.ts`) both read it (saved link first, then
`findLiveBeeperMatchForLead`'s live fuzzy match as a fallback, same
precedence `lead-beeper-links.ts` itself documents) but **never write to
it** — that collection/table is owned by the Msg Auto → Links page
(`packages/dashboard/app/(dashboard)/dashboard/msg-automation/links/`), a
separate, actively-developed feature; writing into it from here would risk
surprising that page's own auto-match/save flow.

`findLeadForConversation`'s fallback path (no saved link) scans every lead
via `findLiveBeeperMatchForLead` to find which one's live match equals the
given conversation id — O(leads), acceptable at this tool's personal-CRM
scale (tens to low hundreds of leads per user), not a pattern to reuse
as-is at a larger scale.
