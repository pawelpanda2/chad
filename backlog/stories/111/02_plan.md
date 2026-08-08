# Story 111 — Plan

Start SHA: `8aa71ae`

1. Read-only audit of all `02_files_refrenced` writers (DONE in inventory).
2. Forensic Photos/Audio inventory on LOCAL host (counts/bytes/hashes/orphans) — no mutation.
3. DBA `file-storage/` contracts + filesystem provider + path policy + PG `cp_referenced_files`.
4. Rewrite lead-photos / google-contact-photos / audio-recordings to use provider; readable names; no new sidecars.
5. Idempotent migrator `--dry-run` then COPY→VERIFY (Photos Lead Info + Audio); no cleanup until PASS.
6. `ai-docs/file-storage/` + begin_here link; tests; local Docker; smoke on test3; commit; no push/PROD.
