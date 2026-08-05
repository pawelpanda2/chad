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
| 7 | Real Google OAuth + live People API | **PASS lokalnie** — authorize OK after Console redirect URI; callback `?connected=1`; status `connected:true`; list **451** contacts; no token leaks in JSON |
| 8 | Compose env passthrough + public callback origin + redirectUri in status/GUI | implemented + Docker redeploy PASS |
| 9 | Commit follow-up | see git log |

## Task notes

- Isolation: tokens under session `runWithRepoContext`; OAuth state rejects other `repoGuid`.
- Client responses never include refresh/access tokens (contacts DTO / status flags only).
- Dockerfile: build `google-contacts` before dashboard.
