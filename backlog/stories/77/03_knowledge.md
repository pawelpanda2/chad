# Story 77 — Knowledge

- `packages/dashboard/app/(dashboard)/dashboard/leads/details/page.tsx` —
  the rounded-card layout standard this Story copies: `Card`/`CardContent`
  from `@/components/ui/card`, `className="gap-0 py-0"` on `Card`,
  `px-[14px] py-[10-12px]` on `CardContent`, `DashboardPageShell
  contentClassName="gap-1"` wrapping the stack. Needed to match the exact
  spacing/rounding instead of guessing shadcn defaults.

- `packages/dashboard/app/(dashboard)/dashboard/history/page.tsx` — the
  page this Story edits. `GoogleSheetsViewContent` fetches
  `/api/google-sheets/info` (already existing, untouched) and renders the
  result; only the JSX layout changed, not the data shape or the API route.

- `packages/dashboard/app/api/google-sheets/info/route.ts` — confirms the
  response shape consumed by the page: `{ enabled, chadUsername,
  spreadsheetId, spreadsheetUrl, spreadsheetError, serviceAccountEmail,
  viewerAccount: { email, password } | null }`. Not modified — this Story
  is a pure presentation change.

- **Local Docker dashboard does not hot-reload.** `chad-dashboard-local-mac-docker`
  (port 12020, per `bash-scripts/dashboard/03_local_mac_docker/`) runs a
  built `.next` standalone image, not `next dev` — editing
  `packages/dashboard/app/**` has zero effect on the running container
  until `bash bash-scripts/dashboard/03_local_mac_docker/06_deploy.sh`
  rebuilds and restarts it. First visual check after this Story's edit
  showed the *old* markup for exactly this reason; only visible after
  running that script. Relevant any time a UI change needs live
  verification against `localhost:12020` specifically (as opposed to a
  `next dev`/tmux session under `02_local_mac_tmux`).

- **Side observation, relevant to the still-unstarted Story 76 (MongoDB
  split):** the `06_deploy.sh` run for this Story showed the current
  `local-mac-docker` compose stack as three containers:
  `chad-dashboard-local-mac-docker`, `chad-history-worker-local-mac-docker`,
  `chad-mongodb-local-mac-docker` — i.e. `chad-history-worker` is
  confirmed, today, to run as its own separate container in this
  environment (not embedded in the dashboard process). Worth carrying into
  Story 76's own research instead of rediscovering it there.
