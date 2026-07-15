# Story 58 — Todos (working scratchpad)

- Root `package.json`'s `mongo:up` script (`docker compose up -d mongodb`)
  is stale — there is no root `docker-compose.yml`; it needs
  `-f docker-compose.local.yml` to actually work. Noticed while wiring up
  local Mongo for this Story; not fixed yet since it's not on this Story's
  critical path (invoking `docker compose -f docker-compose.local.yml up -d
  mongodb` directly works fine). Triage at Story close: fix, or promote to
  `06_others_from_report.md`.
