#!/usr/bin/env node
// Product-code PostgreSQL <-> Google Sheets reconciliation + repair
// (2026-07-28, following the pawel_f Daily lost-outbox finding — see
// tests/release-audit-report.md). Read-only by default (--dry-run, the
// implicit default); --apply enqueues missing outbox jobs through the same
// enqueueGoogleSheetsSync every live mutation uses — never writes to a
// Sheet directly, never deletes/mutates Postgres, never touches
// extra_in_sheet rows.
//
// Usage:
//   node packages/dba/scripts/reconcile-google-sheets.mjs --user=<username> [--record-type=daily|dates|leads|all] [--dry-run|--apply]
//   node packages/dba/scripts/reconcile-google-sheets.mjs --all-mapped-users [--record-type=...]   # read-only report only, --apply requires --user
//
// Requires `pnpm --filter dba build` first (imports ../dist/). Requires
// POSTGRES_URI + GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY +
// GOOGLE_SHEETS_SPREADSHEET_MAP already in the environment (the same env
// the dashboard/worker already runs with — this script does not construct
// its own QNAP connection string).

import { randomUUID } from "node:crypto";

function parseArgs(argv) {
  const args = { apply: false, recordType: "all", allMappedUsers: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    else if (raw === "--dry-run") args.apply = false;
    else if (raw === "--all-mapped-users") args.allMappedUsers = true;
    else if (raw.startsWith("--user=")) args.user = raw.slice("--user=".length);
    else if (raw.startsWith("--record-type=")) args.recordType = raw.slice("--record-type=".length);
  }
  return args;
}

async function loadDba() {
  const distUrl = (p) => new URL(`../dist/${p}`, import.meta.url).href;
  return import(distUrl("index.js"));
}

async function readSheetValues(dba, credentials, spreadsheetId, sheetName) {
  const token = await dba.getServiceAccountAccessToken(credentials, fetch);
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets API GET failed (${res.status}) for "${sheetName}": ${await res.text().catch(() => "")}`);
  const body = await res.json();
  return body.values || [];
}

const TABLES = {
  daily: { label: "daily", headerRowIndex: 1 },
  dates: { label: "dates", headerRowIndex: 0 },
  leads: { label: "leads", headerRowIndex: 0 },
};

async function reconcileUserTable(dba, credentials, { username, repoGuid, spreadsheetId, recordTypeKey, sheetName, pgItems, apply, repairId }) {
  const { headerRowIndex } = TABLES[recordTypeKey];
  const report = {
    user: username,
    recordType: recordTypeKey,
    postgresCount: pgItems.length,
    sheetCount: 0,
    missing: [],
    extra: [],
    duplicates: [],
    lostOutbox: [],
    orphanOutbox: 0,
    failed: [],
    stuckPending: [],
    repaired: [],
    result: "PASS",
  };

  let sheetValues;
  try {
    sheetValues = await readSheetValues(dba, credentials, spreadsheetId, sheetName);
  } catch (err) {
    report.result = `ERROR: ${err.message}`;
    return report;
  }
  const header = sheetValues[headerRowIndex] || [];
  const recordKeyCol = header.indexOf("CHAD_RECORD_KEY");
  const dataRows = recordKeyCol === -1 ? [] : sheetValues.slice(headerRowIndex + 1);
  report.sheetCount = dataRows.length;

  const sheetRecordKeys = dataRows.map((r) => r[recordKeyCol]).filter(Boolean);
  const pgRecordKeys = pgItems.map((e) => `${repoGuid}:${e.loca}`);
  const diff = dba.diffRecordKeys(pgRecordKeys, sheetRecordKeys);
  report.missing = diff.missing;
  report.extra = diff.extra;
  report.duplicates = diff.duplicates;

  // Classify every PostgreSQL record's outbox state (lost_outbox / failed / stuck / ok).
  const staleBefore = Date.now() - 10 * 60 * 1000;
  for (const item of pgItems) {
    const recordKey = `${repoGuid}:${item.loca}`;
    const job = await dba.getLatestGoogleSheetsJobForRecordKey(recordKey);
    const state = dba.classifyOutboxState({ hasHistory: true, job });
    if (state === "lost_outbox") report.lostOutbox.push(recordKey);
    if (state === "failed_visible") report.failed.push({ recordKey, lastError: job.lastError });
    if (job && (job.status === "pending" || job.status === "processing") && new Date(job.updatedAt).getTime() < staleBefore) {
      report.stuckPending.push(recordKey);
    }
  }

  if (report.missing.length > 0 || report.duplicates.length > 0 || report.lostOutbox.length > 0 || report.failed.length > 0) {
    report.result = "FAIL";
  }

  if (apply) {
    for (const recordKey of new Set([...report.missing, ...report.lostOutbox])) {
      const loca = recordKey.slice(repoGuid.length + 1);
      const item = pgItems.find((e) => e.loca === loca);
      if (!item) continue;
      const fields = dba.parseYamlFieldsForSheetSync(item.body || "");
      let sheetFields = fields;
      if (recordTypeKey === "daily") {
        const autoFields = await dba.computeDailyAutoFieldsForSheetSync(fields.DATE ?? "");
        sheetFields = { ...fields, ...autoFields };
      }
      const operationId = randomUUID();
      await dba.enqueueGoogleSheetsSync({
        operationId,
        kind: "upsert",
        payload: {
          recordType: recordTypeKey === "daily" ? "daily-entry" : recordTypeKey === "dates" ? "date-entry" : "lead",
          recordKey,
          repoGuid,
          username,
          spreadsheetId,
          loca,
          itemName: item.itemName,
          fields: sheetFields,
          mutationId: operationId,
        },
      });
      report.repaired.push({ recordKey, jobId: operationId, repairId });
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.user && !args.allMappedUsers) {
    console.error("Usage: --user=<username> [--record-type=daily|dates|leads|all] [--apply]  OR  --all-mapped-users (read-only report only)");
    process.exitCode = 1;
    return;
  }
  if (args.apply && !args.user) {
    console.error("[reconcile-google-sheets] --apply requires --user=<username> — never a blanket apply across every mapped user in one run.");
    process.exitCode = 1;
    return;
  }

  const dba = await loadDba();
  const spreadsheetMap = JSON.parse(process.env.GOOGLE_SHEETS_SPREADSHEET_MAP || "{}");
  const usersToCheck = args.allMappedUsers ? Object.keys(spreadsheetMap) : [args.user];
  const recordTypes = args.recordType === "all" ? ["daily", "dates", "leads"] : [args.recordType];

  const credentials = {
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").includes("\\n")
      ? process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n")
      : process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
  if (!credentials.email || !credentials.privateKey) {
    console.error("[reconcile-google-sheets] GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY not set — cannot read Sheets.");
    process.exitCode = 1;
    return;
  }

  const dailySheetName = process.env.GOOGLE_SHEETS_DAILY_TRACKER_SHEET_NAME || "daily";
  const datesSheetName = process.env.GOOGLE_SHEETS_DATE_ENTRIES_SHEET_NAME || "dates";
  const leadsSheetName = process.env.GOOGLE_SHEETS_LEADS_SHEET_NAME || "leads";
  const sheetNameFor = { daily: dailySheetName, dates: datesSheetName, leads: leadsSheetName };

  const repairId = randomUUID();
  console.log(`[reconcile-google-sheets] mode=${args.apply ? "APPLY" : "DRY-RUN"} repairId=${repairId}`);

  const usersListBody = await dba.getUsersListBody();
  const yaml = (await import("js-yaml")).default;
  const usersDoc = yaml.load(usersListBody || "");
  const usersByName = Object.fromEntries((usersDoc?.users || []).map((u) => [u.username, u]));

  const allReports = [];
  for (const username of usersToCheck) {
    const user = usersByName[username];
    if (!user) {
      console.error(`[reconcile-google-sheets] user "${username}" not found in users-list — skipping.`);
      continue;
    }
    const spreadsheetId = spreadsheetMap[username];
    if (!spreadsheetId) {
      console.log(`[reconcile-google-sheets] ${username}: no spreadsheet configured — skipping.`);
      continue;
    }
    for (const recordTypeKey of recordTypes) {
      const report = await dba.runWithRepoContext({ repoGuid: user.repoGuid, username }, async () => {
        const pgItems =
          recordTypeKey === "daily"
            ? await dba.getAllDailyEntries()
            : recordTypeKey === "dates"
              ? await dba.getAllDateEntries()
              : (await dba.getAllLeadsWithContacts()).map((l) => ({ itemName: l.leadName, loca: l.loca, body: "" }));
        return reconcileUserTable(dba, credentials, {
          username,
          repoGuid: user.repoGuid,
          spreadsheetId,
          recordTypeKey,
          sheetName: sheetNameFor[recordTypeKey],
          pgItems,
          apply: args.apply,
          repairId,
        });
      });
      allReports.push(report);
      console.log(`\n=== ${username} / ${recordTypeKey} ===`, JSON.stringify(report, null, 2));
    }
  }

  await dba.closePostgresConnection().catch(() => {});

  const anyFail = allReports.some((r) => r.result === "FAIL" || r.result.startsWith("ERROR"));
  console.log(`\n[reconcile-google-sheets] ${allReports.length} report(s), ${anyFail ? "at least one FAIL" : "all PASS"}.`);
  process.exitCode = anyFail && !args.apply ? 1 : 0;
}

main().catch((error) => {
  console.error("[reconcile-google-sheets] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
