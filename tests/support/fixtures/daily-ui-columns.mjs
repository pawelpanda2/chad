// Frozen snapshot of the Dashboard's own Daily Tracker column list — see
// `packages/dashboard/app/(dashboard)/dashboard/views/page.tsx`'s
// `DAILY_ENTRY_DOMAIN_COLUMNS` import (re-exported straight from `dba`'s
// mapper as of the tables<->Sheets sync regression suite; before that it
// was a locally-duplicated `DAILY_COLUMNS` array).
//
// This fixture is intentionally maintained BY HAND, independent of
// `packages/dba/src/google-sheets/mapper.ts` — its whole job is to fail
// `daily/mapping-schema.test.mjs` the moment the Dashboard table and the
// Sheets mapper disagree on a column's key or label, even though the UI
// itself now imports the mapper's own constant (Story: any future PR that
// changes DAILY_ENTRY_DOMAIN_COLUMNS in the mapper *for a reason unrelated
// to genuinely changing the Daily Tracker table* must fail here, forcing a
// deliberate update of this fixture instead of a silent drift).
//
// Keep this list's key/label pairs in sync with the *actual on-screen*
// Daily Tracker columns whenever that table intentionally changes.
export const DAILY_UI_COLUMNS = [
  { key: "DATE", label: "DATE" },
  { key: "STATE", label: "STATE" },
  { key: "TRAINING TIME", label: "TRAINING TIME" },
  { key: "VERBAL EXERCISES", label: "VERBAL EXERCISES" },
  { key: "INFIELD", label: "INFIELD" },
  { key: "THEORY", label: "THEORY" },
  { key: "FIELD REVIEW", label: "FIELD REVIEW" },
  { key: "ACTION TIME", label: "ACTION TIME" },
  { key: "APPROACHES", label: "APPROACHES" },
  { key: "LONG INTERACTIONS", label: "LONG INTERACTIONS" },
  { key: "NUMBERS", label: "NUMBERS" },
  { key: "PULLS AUTO", label: "PULLS — AUTO" },
  { key: "FIRST MESSAGES", label: "FIRST MESSAGES" },
  { key: "RESPONSES", label: "RESPONSES" },
  { key: "DATES SET UP", label: "DATES SET UP" },
  { key: "DATES", label: "DATES" },
  { key: "CLOSES AUTO", label: "CLOSES — AUTO" },
  { key: "QUALITY DP AUTO", label: "QUALITY D/P — AUTO" },
  { key: "QUALITY C AUTO", label: "QUALITY C — AUTO" },
  { key: "OUTINGS", label: "OUTINGS" },
];
