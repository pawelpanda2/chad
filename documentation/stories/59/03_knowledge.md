# Story 59 — Knowledge

Context gathered before writing the plan in `02_plan.md`.

- **`documentation/ai-docs/26-07-10_cline_prompt_mongodb_qnap_folders_v3.md`**
  — the core, pre-existing compatibility-model decision for how MongoDB
  relates to the Content Provider: **one Mongo document per CP file**
  (`config.yaml` + `body.txt`, two docs per CP item), unique key
  `address + fileName`, collection name `content_provider_files` (a plain,
  neutral name — not a CP concept), fields `remaining_config` (not
  `remaining_settings`). Critical: **this model is not implemented in code
  yet** — confirmed by `grep -rl content_provider_files packages/` finding
  zero hits in `packages/`, only in documentation. MongoDB today is
  consumed by exactly one thing: the Beeper collections (`dba/src/beeper-crm.ts`
  + `mongo.ts`).
- **This means Beeper's collections and `content_provider_files` are not
  the same kind of data and should not be forced into the same shape.**
  Beeper documents (`contacts`, `channels`, `messages`, ...) mirror live
  external state from Beeper Desktop, not user-authored Content Provider
  items — they have no natural `address + fileName` identity. "Integrating
  Beeper into the Content Provider Mongo" cannot mean reshaping Beeper docs
  into the CP-file model; it means both live as **separate collections in
  the same shared `chad` MongoDB instance**, which is already the
  established architecture ("one instance, many collections" — see
  `chad_monorepo_migration` memory file / `documentation/beeper/architecture.md`).
  The planning work here is about making that coexistence real (actual
  migrated data, not still pointing at `contacts`'s standalone Mongo) and
  safe (no index/naming collisions, one connection-pool story in `dba`).
- **`documentation/beeper/{architecture,mongo-schema,migration}.md`** — the
  prior migration Story's (pre-Story-numbering) output. `migration.md`
  already documents a written-but-unexecuted data migration script
  (`bash-scripts/mongo/migrate-contacts-to-chad.mjs`) and lists
  `beeper-oplog`'s replica-set blocker as a known, deliberately-deferred
  gap.
- **`bash-scripts/mongo/migrate-contacts-to-chad.mjs`** — already
  insert-only, `_id`-preserving, dry-run-by-default, redacts credentials in
  logs. Targets 7 collections (`contacts`, `channels`, `messages`,
  `timeline_events`, `sync_state`, `beeper_events`, `merge_suggestions`)
  into the **target's own database** (whatever `MONGODB_URI` points at) —
  i.e. it already assumes "same collection names, different (chad) Mongo
  instance/database", not a reshape. This matches the "separate
  collections, same instance" model above; the script itself likely
  doesn't need structural changes, just a real target `MONGODB_URI` to run
  against.
- **`pnpm-workspace.yaml`** — already covers `packages/*`, so
  `beeper-ws`/`beeper-sync`/`beeper-oplog` are structurally registered
  workspace packages (confirmed: all three have real `package.json`s with
  correct `name`, `type: module`, and descriptions referencing the shared
  `chad` MongoDB). "Package integration" is therefore **not** a missing
  workspace-registration problem — it's a missing **runtime deployment**
  problem: none of the three packages currently run anywhere against the
  real shared `chad` MongoDB in practice (Story 58 pointed them at
  `contacts`'s standalone Mongo instead, deliberately, to avoid migrating
  data prematurely).
- **QNAP MongoDB replica-set status** — per memory (`qnap_container_data_on_tmpfs_bug`,
  `chad_monorepo_migration`): QNAP's `chad-mongodb` is currently standalone
  (not a replica set) by deliberate, separately-gated decision after a real
  bootstrap-ordering bug during an earlier replica-set attempt. `beeper-oplog`
  needs a replica set (MongoDB change streams require one) and cannot be
  deployed until that decision is revisited and re-approved — this Story
  does not revisit that decision, only plans around it.
- **Rollout convention** (memory: `qnap_ports_and_tailscale`,
  `chad_monorepo_migration`): local Mac → local Mac Docker → QNAP test →
  QNAP prod, each gated on explicit approval. Any concrete migration plan
  here should follow that same sequence, not skip straight to QNAP.
- **`contacts`'s own MongoDB** (verified in Story 58): real data, 152+
  contacts / 3600+ messages and growing, single-node replica set
  (`rs0`, required for its own `beeper-oplog`'s change streams if that were
  ever run from `contacts` itself — it hasn't been). This is the actual
  source of truth to migrate from.
