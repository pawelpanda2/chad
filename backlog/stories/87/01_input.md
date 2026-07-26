# Story 87 — Local Docker login (Invalid credentials)

## Source

User feedback (2026-07-25): local Docker at http://localhost:12020 returns
**Invalid credentials**; workflow must stay
local code → local Docker (full login) → QNAP TEST → PROD.

## Goal

1. Find the exact break in login flow (no guessing).
2. Fix so local Docker login works with local users.
3. Redeploy/verify locally before any QNAP TEST.
