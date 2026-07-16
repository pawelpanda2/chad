# Story 65 — Plan: migrate `packages/net-content-provider` into the existing standalone repo, then attach as a submodule

Source of truth per Input 3: **chad's current working copy of
`packages/net-content-provider` wins**, unconditionally, over whatever the
standalone `content-provider` repo currently has (committed or
uncommitted). The standalone repo is being reused only for its `.git`
directory/history/remote — not for its current file content.

## Etap 1 — Audit (DONE)

See `03_knowledge.md` for full detail. Summary:

| Question | Answer |
|---|---|
| chad root | `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad` |
| Path in chad | `chad/packages/net-content-provider` (552 tracked files) |
| Standalone repo path | `/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/content-provider` |
| Standalone remote | `git@github.com:pawelpanda2/contentprovider.git` |
| Standalone branch | `main`, tracking `origin/main`, 0 ahead/0 behind |
| Standalone HEAD | `14389985cfc8c218d9278baed7abacd6063231e2` ("update", 2026-07-09) |
| Standalone uncommitted changes | 2 files (`appsettings.json` port revert, `PathWorker.cs` cosmetic reformat) — both look stray/unintentional, not valuable |
| `.git` exists in standalone repo? | Yes |
| Is `packages/net-content-provider` currently a submodule in chad? | **No** — plain tracked directory, no `.gitmodules`, no nested `.git` |
| Content comparison | Real divergence; chad's copy is materially *ahead* (e.g. `DefaultPreparer.cs` `/health` diagnostics rewrite exists nowhere in the standalone repo's history — confirmed via pickaxe search). Moot for the plan itself per Input 3, but recorded for the audit trail. |

## Etap 2 — Two backups (DONE)

Both created under
`/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/` (a sibling of
both repos, outside `chad`), timestamp `20260717_013531`:

1. `_backup_net-content-provider_chad_20260717_013531/` — full `cp -a` of
   `chad/packages/net-content-provider` (1370 files). Verified with
   `diff -rq` against the source: **identical, zero differences.**
2. `_backup_net-content-provider_standalone-repo_20260717_013531/` — full
   `cp -a` of the entire standalone `content-provider` repo, including its
   `.git` directory, its 2 uncommitted local edits, and all untracked/IDE
   junk (24547 files). Verified: **identical, zero differences**; its
   `.git` is intact (`git rev-parse HEAD` inside the backup matches the
   live repo's HEAD, `git status` inside the backup shows the same 2
   modified files).

Disk was at 100% capacity / 3.3 GiB free before this step (flagged to the
user); both copies (~780 MB combined) completed and were verified, 3.7 GiB
free afterward. **Interpretation note:** Input 3 asked for "two backups" and
gave an example path for backup #1 (the chad directory) but the message was
cut off before specifying backup #2 explicitly. Backup #2 was chosen as a
full copy of the standalone repo (the other thing about to be modified) —
**this needs the user's confirmation** that this was the intended second
backup before Etap 3 proceeds, since Etap 3 is the first step that actually
modifies anything.

Per requirement 9, **neither backup will be deleted until the user
confirms the whole operation and their own tests are complete.**

## Etap 3 (proposed, NOT YET EXECUTED) — Replace the standalone repo's working tree with chad's content, commit

1. Inside `content-provider` (the standalone repo, real one, not the
   backup): remove everything from the working tree **except `.git`**
   (`git rm -r --cached .` followed by clearing the working tree, or
   equivalently `rsync --delete` chad's tree on top and letting `git status`
   show the deletions — exact mechanics to be finalized at execution time,
   but the invariant is: end state = chad's current file tree, byte for
   byte, with `content-provider/.git` untouched).
2. Copy chad's current `packages/net-content-provider` tree into
   `content-provider`'s working directory, replacing everything.
3. `git add -A` inside `content-provider`, review `git status`/`git diff
   --cached --stat` before committing (standard safety check used
   throughout this project — see memory: always confirm the staged diff
   matches intent before committing).
4. Commit, with a message that plainly states this is a chad-sourced
   snapshot replacing the standalone repo's prior state (e.g. "Replace
   working tree with current chad/packages/net-content-provider snapshot
   (Story 65) — supersedes prior standalone history from this point
   forward").
5. Do **not** push to `origin` as part of this Story unless the user
   separately asks — pushing is a shared/visible action or a call the user
   should confirm explicitly, per general operating rules for this
   environment.
6. Record the resulting commit hash — this is the exact commit chad's
   submodule reference will point at (satisfies requirement 8).

Note on the 2 stray uncommitted edits found in the standalone repo during
the audit (Etap 1): since Etap 3 replaces the *entire* working tree with
chad's content, those 2 edits are naturally superseded/discarded as part of
the normal flow — no separate action needed, and nothing is "lost" in a
history sense because they were never committed anywhere to begin with
(and are preserved for the record in Backup #2 regardless).

## Etap 4 (proposed, NOT YET EXECUTED) — Convert `chad/packages/net-content-provider` into a submodule

1. In `chad`: confirm the working tree is otherwise clean around this path
   (`git status --short packages/net-content-provider` — was empty at
   audit time) before touching it.
2. `git rm -r --cached packages/net-content-provider` (working tree files
   physically remain on disk at this point — `git rm --cached`, not a
   filesystem delete — but see step 3, they get removed right after as
   part of adding the submodule; the physical directory cannot coexist
   with a submodule checkout at the same path).
3. Remove the now-untracked physical directory
   `chad/packages/net-content-provider` from disk **only after** re-
   confirming Backup #1 is intact and verified (already done in Etap 2;
   re-verify immediately before this step too, as a final gate).
4. `git submodule add <standalone-repo-remote-url> packages/net-content-provider`,
   then `cd packages/net-content-provider && git checkout <commit-from-Etap-3>`
   (or pass the branch/commit directly depending on how `git submodule add`
   behaves with a specific commit vs. branch HEAD — needs the exact commit
   pin, not just "whatever `main` is at add-time", per requirement 8).
5. `git add .gitmodules packages/net-content-provider`, review, commit in
   `chad`.
6. Verify: `git submodule status` shows the exact pinned commit; a fresh
   `git clone --recurse-submodules` (or `clone` + `submodule update --init`)
   of `chad` elsewhere reproduces the exact same file tree as
   Backup #1/the pre-migration state.

## Etap 5 (proposed) — Verification before any cleanup

- Diff the submodule's checked-out working tree against Backup #1 — must
  be **zero differences** (this is the real correctness gate: the whole
  point is that chad's tree is unchanged after the migration, just backed
  by a submodule instead of plain tracked files).
- Confirm `chad`'s build/scripts that reference `packages/net-content-provider`
  (e.g. `03_scripts`, `docker-compose*.yml`, `.dockerignore` — see Story 57
  for how easy it is for a path-based mechanism to silently break) still
  resolve correctly against the submodule checkout.
- Only after the user confirms this verification is sufficient: backups
  from Etap 2 may be deleted (requirement 9 — explicitly the user's call,
  not automatic).

## Rollback plan

Rollback is layered to match each Etap, so a problem discovered at any
stage doesn't require unwinding stages that already succeeded:

- **If Etap 3 goes wrong** (bad commit in the standalone repo, wrong
  content, etc.): the standalone repo's own reflog/`git reset --hard
  <prior-HEAD>` (`14389985cfc8c218d9278baed7abacd6063231e2`) fully restores
  it, since nothing was pushed to `origin` yet. Backup #2 is the
  belt-and-suspenders fallback if for any reason the local `.git` itself
  got corrupted (extremely unlikely, but it's why the backup includes
  `.git`).
- **If Etap 4 goes wrong** (submodule add fails, wrong commit pinned,
  chad's tree ends up incomplete/incorrect): `chad`'s own git makes this
  cheap to undo *before committing* (`git submodule deinit`, remove
  `.gitmodules` edits, `git rm --cached` the submodule gitlink, and restore
  the plain directory from Backup #1). If already committed in chad but
  not yet pushed: `git reset --hard <commit-before-Etap-4>` in chad,
  restore the directory from Backup #1 if the working tree was left in a
  broken intermediate state.
- **If chad's history has already been pushed** by the time a problem is
  found: revert commit (not `reset --hard` on shared history — per this
  environment's standing rule against rewriting pushed/shared history
  without explicit confirmation) and restore the directory from Backup #1
  as a new commit.
- **In all cases**, Backup #1 alone is sufficient to restore
  `chad/packages/net-content-provider` to its exact pre-migration state
  regardless of what went wrong in either repo's git internals, and Backup
  #2 alone is sufficient to restore the standalone repo to its exact
  pre-migration state (including its 2 previously-uncommitted stray
  edits, if for some reason those turn out to matter after all).

## What is intentionally NOT part of this plan

- Reconciling chad's extra work (health-diagnostics rewrite, QNAP scripts,
  etc.) into the standalone repo via history-preserving means (e.g. `git
  subtree split` + merge, cherry-picks reproducing chad's own commits
  `7e63eeb`/`56ed0a6`/`14fd2c0`/`6029868` onto `content-provider`'s
  history). Input 3 explicitly says this doesn't matter — chad's *current
  content* is authoritative, and it's being captured as one new commit in
  Etap 3, not reconstructed commit-by-commit. This is simpler and lower-risk
  than a history-merging approach, at the cost of the standalone repo's
  history not showing the intermediate steps (7e63eeb etc.) as separate
  commits — those remain visible in chad's own git history regardless
  (chad's commits aren't going anywhere).
- Pushing either repo's changes to their `origin` remotes — left for the
  user to trigger explicitly once satisfied with local verification.

## Status / what's needed before Etap 3 proceeds

Etap 1 and Etap 2 are complete and verified. **Waiting on:**

1. Confirmation that "Backup #2 = full copy of the standalone repo
   including `.git`" was the intended second backup (Input 3's message was
   cut off before specifying this explicitly).
2. Go-ahead to execute Etap 3 (the first step that actually changes
   anything) — this is a hard-to-reverse-once-pushed class of operation,
   so per this environment's standing rule on such actions, explicit
   confirmation is being sought before proceeding, even though Input 3
   pre-authorized the overall direction in detail.
