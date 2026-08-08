# Story 111 — Checklist

Start SHA: `8aa71ae`

| # | Status | Task |
|---|--------|------|
| 1 | DONE | Baseline `8aa71ae` |
| 2 | DONE | Writers audit + forensic inventory (`06_forensic_inventory.md`) |
| 3 | DONE | DBA `file-storage/` + migration `0004_referenced_files` |
| 4 | DONE | Lead photos → `lead-info/<name>/` + PG metadata; no new sidecars |
| 5 | DONE | Audio new writes → `<user>/10_files_audio/recordings/`; list merges legacy |
| 6 | DONE | Migrator dry-run + execute COPY decoy→canonical (8 files); sources kept |
| 7 | DONE | `ai-docs/file-storage/` + begin_here link |
| 8 | DONE | Unit tests 33 PASS (file-storage + lead-photos + audio) |
| 9 | DONE | Local Docker rebuild (`06_deploy.sh`) + smoke Photos |
| 10 | DONE | Commit Story 111 scope; cleanup of decoy/old flat/sidecars deferred |

## Recovered photos (decoy → lead-info)

7 from `.runtime/cp1-decoy` + 1 already on cp_1 flat → `pawel_f/01_files_photos/lead-info/…`
PG `cp_referenced_files` (QNAP `:12042`): 8 rows. Source files NOT deleted.

## Smoke (LOCAL Docker 2026-08-08)

- Login `pawel_f`: list `loca=03/06/97` → recovered photos; binary GET 200 (hash match).
- Login `test3`: upload → `test3/01_files_photos/lead-info/26-07-25_pn_Smoke/26-07-25_pn_Smoke.png` (no `.json`); delete → PG row gone; file removed (SMB `.smbdelete*` stub only).
- Audio: new write path wired under user; legacy flat mount still listed; full PG audio metadata migration deferred.
- Cleanup of decoy/flat sources/sidecars: **not** executed (await acceptance).
