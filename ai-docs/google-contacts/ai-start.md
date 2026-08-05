# Google Contacts — AI start

Story 103. Read-only Google Contacts via People API for Msg Automation.

## Package

`packages/google-contacts` — DTO, Person→DTO map, OAuth helpers, People client (pagination).

## Auth

Per-user OAuth (`contacts.readonly`). Refresh tokens encrypted with `encryptSecret` in the user’s repo Text item `integrations/google-contacts/oauth-tokens`. Not the Sheets service account.

## Env

- `GOOGLE_CONTACTS_CLIENT_ID`
- `GOOGLE_CONTACTS_CLIENT_SECRET`
- `GOOGLE_CONTACTS_REDIRECT_URI` (e.g. `http://localhost:12020/api/google-contacts/callback`)
- Requires `SECRETS_ENCRYPTION_KEY` and preferably `SESSION_SIGNING_SECRET` (OAuth state HMAC)

## Routes

- GUI: `/dashboard/msg-automation/google-contacts`
- API: `/api/google-contacts/{status,connect,callback,list,disconnect}`
