# Story 100 — Input

**Note:** created retroactively (per `ai-docs/begin_here/03_story-standard.md`
— "a late Story is far better than no Story"). The investigation and fix
below were done directly in conversation before this folder was created;
backfilled here as faithfully as possible immediately after.

Follow-up to Story 91 (`plugins/beeper-synch`) and Story 92 (local Mongo
mirror, official-scripts lifecycle). `packages/beeper-oplog` was flagged as
"not deployed anywhere" in both prior Stories' `06_others_from_report.md`.

## Input 1 (verbatim, Polish)

> sprawdz story z osobnym pluginem w folderze plugins/beeper-synch
> i uzupelnij w tym story informacje o tym ze się nie zalaczylo na stracie
> systemu i trzeba to naprawic w folderze bash-scripts/beeper-synch maja
> byc skrypty do instalacji i powinno sie to ruchamiac na starcie w
> dockerze i działać caly czas synchronizacja z beeperem jakis webhook
> sprawdzanie co kilka sekund albo jakies inne rozwiazanie ktore juz
> pewnie jest w tych packages z ktorych ten plugin korzysta. generalnie
> napraw mi to bo sie nie zaciagnely mi wiadomosci. na poczatek mozesz
> recznie uruchomic pobranie zeby juz je mial, a potem przeanalizowac
> dlaczego to nie zadzialalo i naprawic

Gloss: user asked to (1) check the Story for the `plugins/beeper-synch`
supervisor and add a note that it didn't come up at system startup and
needs fixing, (2) confirm `bash-scripts/beeper-synch` has install scripts
and that the pipeline runs continuously (webhook / few-second polling /
"whatever mechanism the packages this plugin uses probably already have"),
(3) fix why messages weren't being pulled in — first by manually
triggering a fetch so the backlog lands now, then by diagnosing and fixing
the actual root cause.

Two of the three premises turned out to be already true (install scripts
already exist in `bash-scripts/beeper-synch/`; a "few-seconds polling"
mechanism already exists in the packages, unused) — see `03_knowledge.md`
for what was actually found.
