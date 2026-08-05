# Story 103 — Final report (updated after OAuth smoke)

1. **Punkt początkowy Git SHA:** `235b3e653398b15e5915c3d015d443ae719d36ea`
2. **Story:** `backlog/stories/103/`
3. **Zmienione elementy:** package `google-contacts`; DBA token helpers; API; GUI; Dockerfile; compose env passthrough (`GOOGLE_CONTACTS_*`, `SECRETS_ENCRYPTION_KEY`, `SESSION_SIGNING_SECRET`); public callback origin; status exposes `redirectUri`.
4. **Package i publiczny kontrakt:** `packages/google-contacts` — DTO/map/OAuth/People client.
5. **Trasa GUI/API:** `/dashboard/msg-automation/google-contacts`; `/api/google-contacts/*`.
6. **Model auth i storage:** per-user OAuth `contacts.readonly`; encrypted refresh in CP Text; signed OAuth state.
7. **Testy:** vitest **11/11 PASS** (map/people/oauth-state/public-origin); typecheck google-contacts PASS.
8. **Lokalny Docker:** `06_deploy.sh` EXIT 0 (image `chad-dashboard:260805_215740`).
9. **Commit SHA:** `4601ac7` (docs `4e388f6`)
10. **Blokady — real OAuth:**
    - **Etap:** Google authorize (`accounts.google.com/o/oauth2/v2/auth`) — **przed** callback CHAD.
    - **Błąd:** `400 redirect_uri_mismatch`
    - **Rzeczywisty `redirect_uri` w żądaniu:** `http://localhost:12020/api/google-contacts/callback`
    - **client_id:** `481026810910-…ter7hm05.apps.googleusercontent.com` (token endpoint → `invalid_grant` na fake code = credentials OK)
    - Live probe: Google nadal odrzuca ten URI (i inne typowe localhost) dla tego client_id → lista Authorized redirect URIs w Console nie jest skutecznie powiązana z tym klientem / nie zapisana.
    - Callback / state / token exchange / zapis refresh / lista kontaktów: **nieosiągnięte** (Google nie zwraca `code`).
