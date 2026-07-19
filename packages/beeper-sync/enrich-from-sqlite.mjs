/**
 * enrich-from-sqlite.mjs — Wzbogaca displayName kontaktów z lokalnej bazy Matrix (mx_user_profile).
 * account.db zawiera 23k+ profili użytkowników z displayname i avatar_url.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

import { MongoClient } from "mongodb";
import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";
import { resolveOwnerRepoGuid, ownerDatabaseName } from "./lib/owner-db.mjs";

const repoGuid = resolveOwnerRepoGuid();
const execFileAsync = promisify(execFile);
// BEEPER_SQLITE_ACCOUNT_PATH overrides the full path; otherwise derive
// account.db from BEEPER_SQLITE_PATH's directory (same BeeperTexts folder),
// falling back to the default macOS location with zero config.
const ACCOUNT_DB = process.env.BEEPER_SQLITE_ACCOUNT_PATH
  || (process.env.BEEPER_SQLITE_PATH
        ? join(dirname(process.env.BEEPER_SQLITE_PATH), "account.db")
        : join(homedir(), "Library/Application Support/BeeperTexts/account.db"));
const MONGO_URI  = process.env.MONGODB_URI || "mongodb://localhost:27017";

async function sqliteQuery(db, sql) {
  const fullSQL = `PRAGMA busy_timeout=5000; ${sql}`;
  const { stdout } = await execFileAsync("sqlite3", ["-json", db, fullSQL], { maxBuffer: 50 * 1024 * 1024 });
  if (!stdout?.trim()) return [];
  // Wyodrębnij ostatni blok JSON (pomijamy wynik PRAGMA)
  const blocks = stdout.trim().split(/\]\s*\[/);
  const last = blocks.length > 1 ? "[" + blocks.at(-1) : blocks.at(-1);
  try { return JSON.parse(last); } catch { return []; }
}

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));

console.log("[enrich-sqlite] Pobieranie profili z account.db (mx_user_profile)...");

// Pobierz unikalne profile (jeden display per user_id, bierzemy najdłuższy displayname)
const profiles = await sqliteQuery(
  ACCOUNT_DB,
  `SELECT user_id, MAX(displayname) as displayname, MAX(avatar_url) as avatar_url
   FROM mx_user_profile
   WHERE displayname != '' AND user_id LIKE '%:beeper.local'
   GROUP BY user_id`
);

console.log(`[enrich-sqlite] Znaleziono ${profiles.length} profili z nazwami\n`);

let updated = 0;
let skipped = 0;
const BATCH = 200;

for (let i = 0; i < profiles.length; i += BATCH) {
  const batch = profiles.slice(i, i + BATCH);

  const ops = batch.map(p => ({
    updateOne: {
      filter: {
        "identities.senderID": p.user_id,
        // Aktualizuj tylko jeśli displayName wygląda jak raw ID
        $or: [
          { displayName: p.user_id },
          { displayName: { $regex: "^@" } },
        ]
      },
      update: {
        $set: {
          displayName: p.displayname,
          "identities.$[elem].senderName": p.displayname,
          ...(p.avatar_url && p.avatar_url.startsWith("mxc://") ? {} : {}),
          updatedAt: new Date()
        }
      },
      arrayFilters: [{ "elem.senderID": p.user_id }],
    }
  }));

  const result = await db.collection("contacts").bulkWrite(ops, { ordered: false });
  updated  += result.modifiedCount;
  skipped  += batch.length - result.modifiedCount;

  process.stdout.write(`\r  Przetworzono ${i + batch.length}/${profiles.length} profili... (zaktualizowano: ${updated})`);
}

console.log(`\n\n[enrich-sqlite] Gotowe!`);
console.log(`  Zaktualizowane kontakty: ${updated}`);
console.log(`  Pominięte (brak kontaktu w MongoDB lub nazwa już poprawna): ${skipped}`);

// Sprawdź ile zostało bez nazwy
const stillBad = await db.collection("contacts").countDocuments({ displayName: { $regex: "^@" } });
const total    = await db.collection("contacts").countDocuments();
console.log(`\n  Kontakty bez prawdziwej nazwy: ${stillBad} / ${total}`);

await client.close();
