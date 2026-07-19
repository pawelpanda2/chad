/**
 * fix-image-attachments.mjs — Naprawia istniejące wiadomości IMAGE/VIDEO w MongoDB
 * które nie mają pola `attachments` (były zaimportowane zanim dodaliśmy obsługę media).
 *
 * Czyta pole `message` z SQLite (JSON blob) i wyciąga z niego tablicę `attachments`.
 * Następnie aktualizuje dokumenty w MongoDB.
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
const SQLITE_DB = process.env.BEEPER_SQLITE_PATH
  || join(homedir(), "Library/Application Support/BeeperTexts/index.db");
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

async function sqliteQuery(sql) {
  const fullSQL = `PRAGMA busy_timeout=5000; ${sql}`;
  const { stdout } = await execFileAsync("sqlite3", ["-json", SQLITE_DB, fullSQL], { maxBuffer: 50 * 1024 * 1024 })
    .catch(err => ({ stdout: err.stdout ?? "" }));
  if (!stdout?.trim()) return [];
  const blocks = stdout.trim().split(/\]\s*\[/);
  const last  = blocks.length > 1 ? "[" + blocks.at(-1) : blocks.at(-1);
  try { return JSON.parse(last); } catch { return []; }
}

/**
 * Wyciąga listę attachments z pola `message` (JSON blob) SQLite.
 */
function parseAttachments(messageJSON) {
  if (!messageJSON) return [];
  let m;
  try { m = JSON.parse(messageJSON); } catch { return []; }
  return (m.attachments ?? [])
    .filter(a => a.id || a.srcURL)
    .map(a => ({
      type:     a.type ?? "img",
      mimeType: a.mimeType ?? null,
      fileName: a.fileName ?? null,
      fileSize: a.fileSize ?? null,
      srcURL:   a.srcURL ?? a.id ?? null,
      size:     a.size ?? null,
    }));
}

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));
const messagesCol = db.collection("messages");

console.log("[fix-attachments] Szukam wiadomości bez pola attachments...");

// Znajdź wiadomości z typem IMAGE/VIDEO/STICKER bez attachments
const cursor = messagesCol.find({
  type: { $in: ["IMAGE", "VIDEO", "STICKER", "FILE", "AUDIO", "VOICE"] },
  $or: [{ attachments: { $exists: false } }, { attachments: { $size: 0 } }],
  beeperMessageID: { $type: "string" }
});

const toFix = await cursor.toArray();
console.log(`[fix-attachments] Znaleziono ${toFix.length} wiadomości do naprawy\n`);

if (toFix.length === 0) {
  console.log("Brak do naprawy — wychodzę.");
  await client.close();
  process.exit(0);
}

// Zbierz unikalne eventID → zapytaj SQLite batchowo
const eventIDs = [...new Set(toFix.map(m => m.beeperMessageID))];
console.log(`[fix-attachments] Odpytuję SQLite o ${eventIDs.length} eventID...`);

// SQLite nie obsługuje bardzo długich IN clauses — dzielmy na batche po 500
const BATCH = 500;
const sqliteMap = new Map(); // eventID → attachments[]

for (let i = 0; i < eventIDs.length; i += BATCH) {
  const batch = eventIDs.slice(i, i + BATCH);
  const inList = batch.map(id => `'${id.replace(/'/g, "''")}'`).join(",");
  const rows = await sqliteQuery(
    `SELECT eventID, message FROM mx_room_messages WHERE eventID IN (${inList}) AND message IS NOT NULL AND message != ''`
  );
  for (const row of rows) {
    const atts = parseAttachments(row.message);
    if (atts.length > 0) sqliteMap.set(row.eventID, atts);
  }
  process.stdout.write(`\r  SQLite: ${Math.min(i + BATCH, eventIDs.length)}/${eventIDs.length}...`);
}
console.log(`\n[fix-attachments] Załadowano ${sqliteMap.size} rekordów z attachments z SQLite\n`);

// Teraz zaktualizuj MongoDB
let updated = 0;
let notFound = 0;

for (const msg of toFix) {
  const atts = sqliteMap.get(msg.beeperMessageID);
  if (!atts || atts.length === 0) { notFound++; continue; }

  await messagesCol.updateOne(
    { _id: msg._id },
    { $set: { attachments: atts, updatedAt: new Date() } }
  );
  updated++;
}

console.log(`[fix-attachments] Zakończono!`);
console.log(`  Zaktualizowane: ${updated}`);
console.log(`  Brak w SQLite:  ${notFound} (media mogło być już usunięte lub zaszyfrow.)`);

await client.close();
