# Story 103 — Tasks and checklist

## Start point

Git SHA before this Story: `235b3e653398b15e5915c3d015d443ae719d36ea` (clean tree).

## Checklist

| # | Task | Real Status |
|---|------|-------------|
| 1 | Package google-contacts (DTO/map/OAuth/People) | PASS build + typecheck |
| 2 | DBA encrypted per-user token storage | implemented |
| 3 | API connect/callback/status/list/disconnect | implemented; unauth → 401 |
| 4 | GUI page + Msg Automation GOOGLE CONTACTS | implemented |
| 5 | Unit tests (map/people/oauth-state) | PASS 9/9 vitest |
| 6 | Local Docker rebuild + smoke | PASS deploy `06_deploy.sh`; login 200; API status 401 without session; pages redirect to login (307) |
| 7 | Real Google OAuth + live People API | **not run** — no test OAuth credentials in env (`not_configured` expected) |
| 8 | Commit | PASS `6c01c2a74ae0f89d4bf7ac663af36a60815c24d4` |

## Task notes

- Isolation: tokens under session `runWithRepoContext`; OAuth state rejects other `repoGuid`.
- Client responses never include refresh/access tokens (contacts DTO / status flags only).
- Dockerfile: build `google-contacts` before dashboard.
