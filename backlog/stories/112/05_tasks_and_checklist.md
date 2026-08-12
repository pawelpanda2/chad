# Story 112 — chad-data root + user-scoped audio

| # | Status | Task |
|---|--------|------|
| 1 | DONE | Host root → `/…/cp_1/chad-data/02_files_refrenced` |
| 2 | DONE | Compose + env examples updated |
| 3 | DONE | Audio → `<user>/10_files_audio/recordings/` (ownership from sidecar repoGuid) |
| 4 | DONE | Drafts → `<user>/10_files_audio/drafts/` |
| 5 | DONE | DBA path policy / audio writers updated |
| 6 | DONE | COPY→VERIFY migrator; old root kept until acceptance |
| 7 | DONE | Local Docker rebuild + smoke (photos + recordings API) |

Old path `/Volumes/cp_1/02_files_refrenced` **not deleted** (await cleanup acceptance).

Audio ownership: sidecar `repoGuid` → `pawel_f` / `test3` (not all forced to pawel_f).
