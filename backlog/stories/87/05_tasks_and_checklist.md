# Story 87 — Checklist

- [x] Root cause documented (empty local users-list + re-INSERT version bug)
- [x] Migration 0002 applied locally
- [x] Seed script + 03_re-start wiring
- [x] `.env.local` → `DBA_MONGO_MODE=local`
- [x] Seed includes **pawel_f** / kamil_s / test3 / local_dev (not only test3)
- [x] Login `pawel_f` / `test3` / `local_dev` → HTTP 200
- [x] Playwright regression: `pnpm test:e2e:local-login`
- [x] Pages 200: Lead Details, Message Creator, Beeper, Msg Auto, Folders, Views, Forms
- [ ] QNAP TEST — only after user confirms local is enough / asks for TEST
