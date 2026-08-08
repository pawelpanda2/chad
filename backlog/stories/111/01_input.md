# Story 111 — Unify file-storage; migrate Photos/Audio; recover missing photos

Start SHA: `8aa71ae`

User request (v1 summary): establish one DBA file-storage layer for all
`02_files_refrenced` writes; migrate Photos Lead Info to
`<user>/01_files_photos/lead-info/<lead-name>/` with readable names and
Postgres metadata (no sidecars); move Audio under
`<user>/10_files_audio/recordings/`; forensic recovery of missing photos;
docs in `ai-docs/file-storage/`. Full prompt kept in conversation.

Hard rules: inventory/backup before mutation; COPY→VERIFY; no PROD; no push;
no guessing orphan→lead assignment; leave parallel WIP alone.
