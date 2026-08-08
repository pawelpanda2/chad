# Story 111 — Forensic inventory (read-only)

Date: 2026-08-08. Start SHA: `8aa71ae`.

## Mounts

| Env | Photos root | Audio root |
|-----|-------------|------------|
| LOCAL host | `/Volumes/cp_1/02_files_refrenced` | `…/10_files_audio` (sibling of users) |
| Container | `/app/contact-photos` | `/app/audio-recordings` |
| Decoy (bug) | `.runtime/cp1-decoy/02_files_refrenced` | — |

## Photos — LOCAL `cp_1`

| Owner | Images | Sidecars | Bytes | Notes |
|-------|--------|----------|-------|-------|
| pawel_f | 1 | 1 | ~753 KiB | `latina.png` → leadLoca `03/06/97` |
| test3 | 0 | 0 | 0 | no `01_files_photos` |

Also under `pawel_f/01_files_photos/`: 6× `.smbdelete*` — SMB delete leftovers of smoke-test 2×2 PNGs + their sidecars (not real photos).

## Photos — DECOY (recovered)

**Root cause of “missing” GUI photos:** when `cp_1` was unmounted, Docker wrote into
`.runtime/cp1-decoy/02_files_refrenced/pawel_f/01_files_photos/`.

| # | leadLoca | originalFileName | size | file |
|---|----------|------------------|------|------|
| 1 | 03/06/62 | luba.png | 1410086 | `2026-08-07_19-50-48_b6bc6e02-….png` |
| 2 | 03/06/79 | olia.png | 854192 | `2026-08-07_19-52-02_49b7d473-….png` |
| 3 | 03/06/98 | dorota.png | 727578 | `2026-08-07_20-13-44_7f1af5b2-….png` |
| 4 | 03/06/97 | 26-08-01_nn_latina.png | 870721 | `2026-08-07_21-32-12_6c18cca3-….png` |
| 5 | 03/06/66 | daria.png | 650189 | `2026-08-07_21-33-25_8b72cdb7-….png` |
| 6 | 03/06/92 | ayisha.png | 913000 | `2026-08-07_21-36-17_23620f9d-….png` |
| 7 | 03/06/94 | claudia-delfin.png | 807904 | `2026-08-07_21-37-14_75eaaa1a-….png` |

All 7 have matching sidecars. **Do not delete decoy until COPY→VERIFY into canonical tree.**

## Audio — LOCAL

Global (not user-scoped): `/Volumes/cp_1/02_files_refrenced/10_files_audio/`

- 6 root `.webm` (+ 4 with sidecars; 2 legacy without)
- drafts/ with segments
- ~1.9 MiB total
- No per-user `*/10_files_audio` dirs yet

## Writers audit (summary)

See conversation audit: contact photos, lead photos, lead archives (PG), audio + drafts, CP zip import staging — all already go through DBA modules; dashboard only streams. Path policy is duplicated per feature today.
