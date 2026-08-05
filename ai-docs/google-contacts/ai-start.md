# Google Contacts — AI start

Story 103. Read-only Google Contacts via People API for Msg Automation.

## Package

`packages/google-contacts` — DTO, Person→DTO map (incl. memberships), contactGroups.list,
local `filterGoogleContacts` (search + multi group / — no group —), OAuth helpers,
People client (pagination).

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

## OAuth troubleshooting

`redirect_uri_mismatch` happens at Google’s authorize step (before CHAD
callback). The authorize request’s `redirect_uri` must be listed under
**Authorized redirect URIs** for the same OAuth client id as
`GOOGLE_CONTACTS_CLIENT_ID` (Web application). Live probe: open the
`authUrl` from `/api/google-contacts/connect` — if Google shows
`redirect_uri_mismatch`, CHAD never receives `code`. Token endpoint
`invalid_grant` on a fake code means client id/secret are valid.
