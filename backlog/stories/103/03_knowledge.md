# Story 103 — Knowledge (Google Contacts / People API)

- **Auth model:** user OAuth (consent), not Sheets service account. Scope:
  `https://www.googleapis.com/auth/contacts.readonly`.
- **API:** Google People API `people.connections.list` with page tokens;
  package follows all pages via `listAllGoogleContacts`.
- **DTO:** `GoogleContactDto` in `packages/google-contacts` — never leak raw
  People responses into Dashboard UI.
- **Token storage:** encrypted refresh token in user’s own CP Text item
  `integrations/google-contacts/oauth-tokens` via `encryptSecret` /
  `runWithRepoContext` (session user only).
- **OAuth state:** HMAC payload binds `repoGuid` + TTL; CSRF + cross-user
  mismatch rejected (`repo_mismatch`).
- **Env:** `GOOGLE_CONTACTS_CLIENT_ID`, `GOOGLE_CONTACTS_CLIENT_SECRET`,
  `GOOGLE_CONTACTS_REDIRECT_URI`; needs `SECRETS_ENCRYPTION_KEY` /
  `SESSION_SIGNING_SECRET`.
- **Docker:** builder must `pnpm --filter google-contacts build` before
  dashboard (workspace dist import).
