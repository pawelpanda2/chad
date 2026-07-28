// Idempotent test3 fixture provisioner (Story 78, Input 1 §2 + Input 2).
// Runs against the REAL, shared QNAP TEST Mongo — never a local/isolated
// database — using test3's own repo, isolated by repoGuid. Every write goes
// through the exact same `dba` functions (saveDailyEntry/saveDateEntry) the
// real app uses, inside runWithRepoContext, so it's indistinguishable from
// a real user's own writes — never a hand-rolled cp_items insert.
//
// Usage: node test/support/provision-test3.mjs
import { loadQnapEnv } from "./qnap-env.mjs";
loadQnapEnv();

const { runWithRepoContext, saveDailyEntry, saveDateEntry, getAllDailyEntries, getAllDateEntries, generateEntryName } =
  await import("../../packages/dba/dist/index.js");
const { TEST3_REPO_GUID, TEST3_USERNAME, assertTest3Scoped, assertIsTest3Session } = await import(
  "../../packages/dba/dist/testing/test3-guard.js"
);

const SESSION = { repoGuid: TEST3_REPO_GUID, username: TEST3_USERNAME };
assertIsTest3Session(SESSION); // defense-in-depth — see test3-guard.ts's own doc comment.

// Every synthetic value below is deliberately fake/non-sensitive per Story
// 78 Input 1 §2.1 ("E2E Alice", "E2E Tinder", https://example.invalid/...).
const SEED_MARKER = "story78-seed";

function dailyYaml(fields) {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${JSON.stringify(String(v))}`);
  return lines.join("\n");
}

async function ensureSeedData() {
  return runWithRepoContext(SESSION, async () => {
    const [existingDaily, existingDates] = await Promise.all([getAllDailyEntries(), getAllDateEntries()]);

    const alreadySeeded = existingDaily.some((e) => (e.body || "").includes(SEED_MARKER));
    if (alreadySeeded) {
      console.log(`[provision-test3] initial seed already present (${existingDaily.length} daily, ${existingDates.length} date entries) — skipping, idempotent.`);
      return { daily: existingDaily, dates: existingDates, created: false };
    }

    console.log("[provision-test3] no seed marker found — creating initial state.");

    // 3 Date Entries, two sharing the same DATA so PULLS/CLOSES/QUALITY
    // AUTO columns are actually exercised (Input 1 §2.2).
    const dateSeeds = [
      { DATA: "2026-01-10", "ŹRÓDŁO": "E2E Tinder", NAZWA: "E2E Alice", LINK: "https://example.invalid/alice", PULL: "TRUE", CLOSE: "TAK", "JAKOŚĆ": "8.0", MARKER: SEED_MARKER },
      { DATA: "2026-01-10", "ŹRÓDŁO": "E2E Bumble", NAZWA: "E2E Blair", LINK: "https://example.invalid/blair", PULL: "FALSE", CLOSE: "BLISKO", "JAKOŚĆ": "7.0", MARKER: SEED_MARKER },
      { DATA: "2026-01-12", "ŹRÓDŁO": "E2E Hinge", NAZWA: "E2E Casey", LINK: "https://example.invalid/casey", PULL: "TRUE", CLOSE: "TAK", "JAKOŚĆ": "9.0", MARKER: SEED_MARKER },
    ];
    const dailySeeds = [
      { DATE: "2026-01-10", STATE: "E2E City", "TRAINING TIME": "1:00:00", "VERBAL EXERCISES": "0", INFIELD: "1:00:00", THEORY: "0:00:00", "FIELD REVIEW": "0:00:00", "ACTION TIME": "1:00:00", OUTINGS: "1", APPROACHES: "3", "LONG INTERACTIONS": "2", NUMBERS: "1", "FIRST MESSAGES": "1", RESPONSES: "1", "DATES SET UP": "1", DATES: "2", MARKER: SEED_MARKER },
      { DATE: "2026-01-12", STATE: "E2E City", "TRAINING TIME": "0:30:00", "VERBAL EXERCISES": "0", INFIELD: "0:30:00", THEORY: "0:00:00", "FIELD REVIEW": "0:00:00", "ACTION TIME": "0:30:00", OUTINGS: "1", APPROACHES: "2", "LONG INTERACTIONS": "1", NUMBERS: "1", "FIRST MESSAGES": "1", RESPONSES: "1", "DATES SET UP": "1", DATES: "1", MARKER: SEED_MARKER },
    ];

    const dateNames = existingDates.map((e) => e.itemName);
    for (const fields of dateSeeds) {
      const itemName = generateEntryName(dateNames);
      dateNames.push(itemName);
      const result = await saveDateEntry(itemName, dailyYaml(fields));
      if (!result.success) throw new Error(`saveDateEntry failed for itemName=${itemName}`);
      assertTest3Scoped(`${TEST3_REPO_GUID}/${result.loca}`);
      console.log(`[provision-test3] created Date Entry loca=${result.loca} DATA=${fields.DATA}`);
    }

    const dailyNames = existingDaily.map((e) => e.itemName);
    for (const fields of dailySeeds) {
      const itemName = generateEntryName(dailyNames);
      dailyNames.push(itemName);
      const result = await saveDailyEntry(itemName, dailyYaml(fields));
      if (!result.success) throw new Error(`saveDailyEntry failed for itemName=${itemName}`);
      assertTest3Scoped(`${TEST3_REPO_GUID}/${result.loca}`);
      console.log(`[provision-test3] created Daily Entry loca=${result.loca} DATE=${fields.DATE}`);
    }

    return { created: true };
  });
}

const result = await ensureSeedData();
console.log("[provision-test3] done.", result.created ? "(created new seed)" : "(idempotent no-op)");
process.exit(0);
