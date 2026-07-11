# content-provider (future implementation — NOT production yet)

Status: **skeleton only, created 2026-07-10.** This is not a working Content Provider. Do not point any real dashboard/console traffic at it.

## What this is

The intended future TypeScript/Node.js implementation of Content Provider — a gradual, stage-by-stage replacement for [`packages/net-content-provider`](../net-content-provider), which is the current, actually running implementation (.NET API, Blazor frontend, Aspire, and several earlier experiments — see its own README/architecture).

## What this is not (yet)

- Not deployed anywhere, not started by any script.
- Not wired into `begin.sh`/tmuxinator — `packages/net-content-provider` is what actually runs today.
- Does not implement `GetItem`, `GetByNames`, `Put`, `PostParentItem`, or anything else from the real API surface.
- Not copied from `net-content-provider/typescript` or `net-content-provider/typescript_runner` — those weren't reviewed for currency against today's architecture before this skeleton was created, per explicit instruction not to copy blindly.

## What's here

- `src/types.ts` — the compatibility model types already decided in `documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md` (`address + fileName` as the unique key, required `config.yaml` fields, everything else in `remaining_config`). Nothing else.

## Intended migration direction

```txt
net-content-provider (.NET, running today)
        ↓ stage by stage, not a rewrite
content-provider (this package)
```

Planned stages (not started): read items (`GetItem`), `GetByNames`, `Put`, `PostParentItem`, import/export to/from `net-content-provider`'s file format, MongoDB integration. Each stage must keep API/data-model compatibility with the legacy implementation until it's fully retired.
