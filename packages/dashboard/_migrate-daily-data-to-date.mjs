// One-off migration script (Story 71, Task 1): rename the `DATA` YAML key
// to `DATE` in every Daily Tracker entry (views/daily) that still uses the
// old field name. Reads directly via GetByNames+GetItem (the original,
// stable per-child path) rather than dba's getAllDailyEntries(), which now
// depends on GetListOfBody — a mechanism still being tuned on the C# side
// (Task 2). Decoupling this migration from that in-progress work. Writes
// via dba's own updateDailyEntry (GetItem -> Put on the same loca), the
// sanctioned existing write pattern per ai-docs/begin_here/05_endpoint-rules.md.
//
// Usage:
//   node _migrate-daily-data-to-date.mjs            -> dry run (report only)
//   node _migrate-daily-data-to-date.mjs --apply     -> actually write changes

process.env.CONTENT_PROVIDER_API_URL = "http://localhost:12024";

const dbaPath = "/Users/pawelfluder/03_synch/01_files_programming/08_nodejs/chad/packages/dba/dist/index.js";
const yamlPath = "js-yaml";

const { invokeContentProvider, updateDailyEntry, runWithRepoContext } = await import(dbaPath);
const yaml = await import(yamlPath);

const APPLY = process.argv.includes("--apply");

// Real, provisioned users only (per chad_admin/users/users-list — test2/test3
// have no repo provisioned and are skipped).
const USERS = [
  { username: "pawel_f", repoGuid: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641" },
  { username: "kamil_s", repoGuid: "8b603669-f8e6-4224-bd78-a474998995fa" },
];

function parseYamlBody(body) {
  if (!body) return null;
  try {
    const result = yaml.load(body);
    if (result && typeof result === "object" && !Array.isArray(result)) return result;
    return null;
  } catch {
    return null;
  }
}

// Direct GetByNames + per-child GetItem — same shape as the pre-Task-2
// getAllChildTextItems, kept self-contained here so this migration doesn't
// depend on the still-in-progress GetListOfBody mechanism.
async function getAllDailyEntriesDirect(repoGuid) {
  const folderResult = await invokeContentProvider([
    "IRepoService", "IItemWorker", "GetByNames", repoGuid, "views", "daily",
  ]);
  if (!folderResult?.Settings?.address) return [];
  const folderLoca = folderResult.Settings.address.replace(`${repoGuid}/`, "");
  const childrenBody = folderResult?.Body;
  if (!childrenBody || typeof childrenBody !== "object") return [];

  const entries = [];
  for (const [physicalKey, logicalName] of Object.entries(childrenBody)) {
    if (typeof physicalKey !== "string" || !physicalKey || typeof logicalName !== "string") continue;
    const childLoca = `${folderLoca}/${physicalKey}`;
    const itemResult = await invokeContentProvider([
      "IRepoService", "IItemWorker", "GetItem", repoGuid, childLoca,
    ]);
    const body = itemResult?.Body
      ? (typeof itemResult.Body === "string" ? itemResult.Body : JSON.stringify(itemResult.Body))
      : undefined;
    entries.push({ itemName: logicalName, loca: childLoca, body });
  }
  return entries;
}

let totalAffected = 0;
let totalUpdated = 0;

for (const user of USERS) {
  const entries = await runWithRepoContext(user, () => getAllDailyEntriesDirect(user.repoGuid));
  const affected = [];

  for (const entry of entries) {
    const fields = parseYamlBody(entry.body);
    if (!fields) continue;
    if (Object.prototype.hasOwnProperty.call(fields, "DATA")) {
      affected.push({ entry, fields });
    }
  }

  console.log(`\n=== ${user.username} (${user.repoGuid}) ===`);
  console.log(`Total daily entries: ${entries.length}`);
  console.log(`Entries with DATA key (to migrate to DATE): ${affected.length}`);
  totalAffected += affected.length;

  for (const { entry, fields } of affected) {
    // Rebuild the field object with DATA renamed to DATE, preserving every
    // other key and its value, and preserving key order as much as possible
    // (DATE takes DATA's original position).
    const newFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (key === "DATA") {
        if (Object.prototype.hasOwnProperty.call(fields, "DATE")) {
          // Entry already somehow has both — do not overwrite the existing
          // DATE value; just drop the redundant DATA key (should not happen
          // in practice, but "never overwrite other fields" applies to DATE
          // too if it's already correctly present).
          continue;
        }
        newFields["DATE"] = value;
      } else {
        newFields[key] = value;
      }
    }

    console.log(`  - ${entry.loca} (itemName "${entry.itemName}"): DATA="${fields.DATA}" -> DATE, ${Object.keys(fields).length} total keys preserved`);

    if (APPLY) {
      const newBodyYaml = yaml.dump(newFields);
      await runWithRepoContext(user, () => updateDailyEntry(entry.loca, newBodyYaml));
      totalUpdated++;
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Total entries requiring migration: ${totalAffected}`);
if (APPLY) {
  console.log(`Total entries updated: ${totalUpdated}`);
} else {
  console.log(`DRY RUN — no data was changed. Re-run with --apply to perform the migration.`);
}
