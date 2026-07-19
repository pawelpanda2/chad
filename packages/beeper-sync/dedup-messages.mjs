/**
 * dedup-messages.mjs — Usuwa zduplikowane wiadomości z MongoDB.
 *
 * Problem: te same wiadomości zostały zaimportowane dwukrotnie z dwóch źródeł:
 *   - REST API (beeper-sync lub oplog): beeperMessageID = liczba (np. "44632")  
 *   - SQLite sync: beeperMessageID = Matrix event ID (np. "$BZ1JLguBxwb-...")
 *
 * Strategia deduplicacji:
 *   Grupuj po (contactID, timestamp, isSelf, text) — te cztery pola identyfikują
 *   unikalną wiadomość niezależnie od źródła i ewentualnie powielonych kanałów.
 *
 *   Gdy jest kolizja, zachowaj:
 *     1. Wersję z Matrix ID ($...) — ma pełną historię z SQLite
 *     2. Jeśli obie są Matrix lub obie numeryczne — zachowaj starszą (createdAt min)
 *
 *   Przenieś reactions i attachments z usuwanej wersji do zachowanej.
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

import { MongoClient } from "mongodb";
import { resolveOwnerRepoGuid, ownerDatabaseName } from "./lib/owner-db.mjs";

const repoGuid = resolveOwnerRepoGuid();
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DRY_RUN = process.argv.includes("--dry-run");

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));
const col = db.collection("messages");

console.log(`
╔══════════════════════════════════════════════════════════╗
║       Deduplication: messages collection                 ║
╚══════════════════════════════════════════════════════════╝
Tryb: ${DRY_RUN ? "DRY RUN (bez zmian)" : "LIVE (usuwam duplikaty)"}
`);

// Znajdź wszystkie grupy duplikatów po (channelID, timestamp, isSelf)
const dupeGroups = await col.aggregate([
  {
    $group: {
      _id: { contactID: "$contactID", timestamp: "$timestamp", isSelf: "$isSelf", text: "$text" },
      count:   { $sum: 1 },
      docs:    { $push: { _id: "$_id", beeperMessageID: "$beeperMessageID", text: "$text", type: "$type", createdAt: "$createdAt", reactions: "$reactions", attachments: "$attachments", channelID: "$channelID" } }
    }
  },
  { $match: { count: { $gt: 1 } } }
], { allowDiskUse: true }).toArray();

console.log(`Znaleziono ${dupeGroups.length} grup potencjalnych duplikatów (ten sam timestamp)\n`);

let deleted = 0;
let mergedReactions = 0;
let mergedAttachments = 0;

for (const group of dupeGroups) {
  const { docs } = group;
  // Prefer Matrix docs (starts with $)
  docs.sort((a, b) => {
    const aIsMatrix = a.beeperMessageID?.startsWith("$") ? 1 : 0;
    const bIsMatrix = b.beeperMessageID?.startsWith("$") ? 1 : 0;
    if (aIsMatrix !== bIsMatrix) return bIsMatrix - aIsMatrix; // Matrix first
    return (a.createdAt || 0) - (b.createdAt || 0); // Older first
  });

  const primary = docs[0];
  const duplicates = docs.slice(1);

  for (const doc of duplicates) {
    // Scal reakcje
    let mergedReactionsList = [...(primary.reactions ?? [])];
    for (const r of (doc.reactions ?? [])) {
      if (!mergedReactionsList.some(mr => mr.senderID === r.senderID && mr.emoji === r.emoji)) {
        mergedReactionsList.push(r);
        mergedReactions++;
      }
    }

    // Scal załączniki
    let mergedAttachmentsList = [...(primary.attachments ?? [])];
    for (const a of (doc.attachments ?? [])) {
      if (!mergedAttachmentsList.some(ma => ma.srcURL === a.srcURL)) {
        mergedAttachmentsList.push(a);
        mergedAttachments++;
      }
    }

    if (!DRY_RUN) {
      await col.updateOne(
        { _id: primary._id },
        { $set: { reactions: mergedReactionsList, attachments: mergedAttachmentsList, updatedAt: new Date() } }
      );
      // update primary in memory in case there are more duplicates in this group
      primary.reactions = mergedReactionsList;
      primary.attachments = mergedAttachmentsList;

      await col.deleteOne({ _id: doc._id });
    }
    deleted++;
  }
}

console.log(`
╔══════════════════════════════════════════════════════════╗
║  Deduplicacja zakończona!                                ║
╚══════════════════════════════════════════════════════════╝
  Grupy duplikatów:   ${dupeGroups.length}
  ${DRY_RUN ? "Do usunięcia" : "Usuniętych"} dokumentów:  ${deleted}
  Scalonych reactions:    ${mergedReactions}
  Scalonych attachments:  ${mergedAttachments}
  ${DRY_RUN ? "\n⚠️  DRY RUN — brak zmian. Uruchom bez --dry-run żeby usunąć." : ""}
`);

// Weryfikacja po operacji
if (!DRY_RUN) {
  const remaining = await col.aggregate([
    { $group: { _id: { contactID: "$contactID", timestamp: "$timestamp", isSelf: "$isSelf", text: "$text" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "remaining" }
  ]).toArray();
  console.log("Pozostałe duplikaty po deduplicacji:", remaining[0]?.remaining ?? 0);
}

await client.close();
