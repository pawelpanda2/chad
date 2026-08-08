# Story 110 — manually added msg: readable ZIPs + Postgres metadata + menu

Start SHA: `e63c232`

(User prompt v11 — full text kept in conversation; summary of requirements:)

- Path: `02_files_refrenced/<user>/02_files_zip/manually-added-msg/<readable>.zip`
- Readable filename from lead name; UUID only in Postgres; collision suffixes `_2`, `_3`
- Postgres is metadata source of truth; no new `.zip.json` sidecars
- Stable `lead_uuid`; `lead_name_at_export` + `file_name` are snapshots
- Menu label `manually added msg`; sidebar/hub three lines: manually / added / msg
- Atomic file+DB with compensation; compat for old sidecars without mass migration
- No PROD; local Docker rebuild required; leave parallel Story 109 WIP untouched
