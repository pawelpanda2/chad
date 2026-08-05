# Story 103 — Plan

## Auth decision

- User OAuth (not service account) — scope `contacts.readonly`.
- Refresh token stored per CHAD user via `encryptSecret` in Text item `integrations/google-contacts` → `oauth-tokens`.
- OAuth `state` = HMAC-signed payload (`repoGuid` + nonce + exp) using `SESSION_SIGNING_SECRET` / fallback `SECRETS_ENCRYPTION_KEY`.
- Env: `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`, `GOOGLE_CONTACTS_REDIRECT_URI`.

## Architecture

`google-contacts` package (DTO, map, OAuth helpers, People client)  
→ thin DBA token store + dashboard API adapters  
→ GUI page under Msg Automation.
