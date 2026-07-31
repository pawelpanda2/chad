# Story 96 — Others

## Architectural decisions

- **`chad_shared` repoGuid is a constant, not a lookup by name.** The repo
  did not exist before this Story; a GUID was generated once and hardcoded
  as `CHAD_SHARED_REPO_GUID` (`31275a71-3dd0-41a2-8874-2d12dac01590`) in
  `packages/dba/src/knowledge.ts`, mirroring how `chad_admin` is already
  addressed by a known GUID. The seed script and all reads/writes use this
  constant, so the client never supplies or even sees a raw repoGuid for
  Knowledge.
- **Slugs are derived, not stored.** URL slugs come from
  `slugifyKnowledgeName(config.name)` at read time (diacritics stripped,
  collisions disambiguated with the CP numeric index suffix). This avoids
  adding a new persisted field to CpItem config; the trade-off (renaming an
  item changes its URL, old URL → controlled 404) was accepted as the
  simpler contract for a read-only view.
- **Category view uses one bulk query.** `findRecursively(address, "")`
  (empty phrase = match-all in both the Postgres and Mongo providers) pulls
  a category's whole subtree in a single query — no per-section N+1 and no
  new provider method was needed.
- **Admin guard reused, not invented.** `chad_shared` write access rides on
  the existing users-list `role: "admin"` check (same guard family as
  `allowSystemFolderWrite`), exposed through
  `resolveFoldersRepoAccess`/`listSelectableFoldersRepos` in dba so every
  API verb validates independently of the UI dropdown.

## Problems encountered

- **Entanglement with uncommitted Story 95 work.** Story 95 (Folders
  Body/Config editor) finished but left its implementation uncommitted in
  this working tree. Three files carry BOTH stories' changes and cannot be
  split cleanly (this Story's `repoGuid` handling in the config-save path
  sits inside code Story 95 introduced):
  - `packages/dashboard/app/(dashboard)/dashboard/folders/page.tsx`
  - `packages/dashboard/app/api/folders/route.ts`
  - `packages/dashboard/app/api/folders/config/route.ts` (untracked)
  Committing them would commit Story 95's work under this Story's message;
  hand-crafting a HEAD+96-only variant would commit a tree that was never
  built or smoke-tested. Decision: this Story's commit contains only its
  exclusive files (self-consistent — the committed tree builds without the
  Folders changes); the three shared files stay in the working tree,
  verified in Docker, to be committed together with/after Story 95's
  commit.
- **Local Docker connects to the remote CHAD Postgres, not a local DB.**
  `dev-db-override.ts` rewrites non-QNAP `POSTGRES_URI` values to the
  Tailscale QNAP URI, so the "local mirror (postgres:5432)" status line is
  misleading — seed and smoke mutations hit the real shared database. All
  mutations were therefore limited to the new `chad_shared` repo (created
  this Story) and one clearly-prefixed fixture subtree that was deleted
  after verification; no user repos touched.
- Two unrelated parallel commits (`c4f6428`, `a513c4c`) landed mid-Story;
  after them `packages/dba/src/index.ts` and `vitest.config.mjs` diffs
  reduced to exactly this Story's lines, simplifying commit scoping.

## Follow-up proposals (not implemented this Story)

- Commit the three shared Folders files once Story 95's work is committed
  (one combined "Folders" commit is the safest path — both change sets are
  already smoke-tested together in the local Docker stack).
- Fill in real document bodies for the Verbal Game structure via Folders
  (seed created empty bodies by design — no fabricated content).
- If a document "kind" label (dokument/ćwiczenie/tematy, present in the old
  static mock) is wanted back, it needs a real field in CpItem config — a
  small dedicated Story.
