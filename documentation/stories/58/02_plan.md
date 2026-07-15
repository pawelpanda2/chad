# Story 58 — Plan

No formal Plan Mode was used for this Story — the user's Input 1 already
specified an explicit execution order ("## 7. Kolejność pracy") and
explicit boundaries (what is *not* a blocker, what still requires a stop).
That ordering is adopted directly as this Story's plan:

1. Start the local stack (MongoDB, Content Provider API, dashboard) using
   the repo's existing local-mac scripts — do not invent new ones.
2. Confirm the dashboard is reachable locally with the Beeper tab present.
3. Test the core Beeper views in a real browser: login, contacts list,
   contact detail, inbox, search, merge suggestions, empty states, API
   errors, page refresh.
4. Fix any real runtime errors found during that testing pass.
5. Run `bash-scripts/mongo/migrate-contacts-to-chad.mjs` in dry-run mode
   against the real `contacts` source Mongo and the local `chad` target
   Mongo — do not look up connection details from the user, derive them
   from the existing `contacts` source `.env`, this repo's
   `.env.qnap`/`.env.local`, and Compose files.
6. Report the dry-run counts/duplicates/conflicts/indexes.
7. Exercise `beeper-ws`/`beeper-sync` against a real, locally running
   Beeper Desktop in a safe/sample mode (connectivity + a small sample,
   not a full history import).
8. Add a "media unavailable" placeholder for attachments (first-version
   scope, no central media storage), and record deferred features
   (`/affinity`, avatar cropper, Google-Contacts merge suggestions) as
   explicitly out of scope for this pass, not blockers.
9. Produce the final report: what works at runtime, what doesn't, fixes
   made, dry-run results, source/target record counts, deferred features,
   and concrete next steps.

Explicit non-goals for this Story (per Input 1): no new large features, no
PROD deploy, no real (non-dry-run) data write to Mongo without an explicit
go-ahead after the dry-run report, no MongoDB replica-set/QNAP
configuration changes just to unblock `beeper-oplog`.

Stop conditions (per Input 1) — the only things that should pause this
Story rather than being worked around: risk of data loss, needing to move
from dry-run to a real write, needing a PROD change, or a piece of
information genuinely not derivable from code/docs/existing env files
(e.g. a real user password, which is bcrypt-hashed and cannot be recovered
from `chad_admin/users-list`).
