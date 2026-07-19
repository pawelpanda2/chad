/**
 * cleanup-ghosts.mjs — Jednorazowy skrypt czyszczący "ghost" wiadomości z MongoDB.
 *
 * Ghost messages mają identyczny wzorzec:
 *   - beeperMessageID: null
 *   - text: ""
 *   - type: "TEXT"
 *   - reactions: [{senderID: null, emoji: "👍"}]
 *
 * Skrypt:
 *   1. Usuwa ghost messages
 *   2. Usuwa kanały które po usunięciu ghostów nie mają żadnych wiadomości
 *   3. Czyści sync_state dla usuniętych kanałów
 *   4. Aktualizuje lastMessageAt na kanałach, gdzie ghost był ostatnią wiadomością
 *
 * Użycie:
 *   node cleanup-ghosts.mjs --dry-run   # podgląd bez zmian
 *   node cleanup-ghosts.mjs             # live cleanup
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
const messagesCol  = db.collection("messages");
const channelsCol  = db.collection("channels");
const syncStateCol = db.collection("sync_state");

console.log(`
╔══════════════════════════════════════════════════════════╗
║       Ghost Messages Cleanup                             ║
╚══════════════════════════════════════════════════════════╝
Tryb: ${DRY_RUN ? "DRY RUN (bez zmian)" : "LIVE (usuwam ghost messages)"}
`);

// ── 1. Znajdź ghost messages ─────────────────────────────────────────────────
const ghostFilter = {
  beeperMessageID: null,
  text: "",
  type: "TEXT",
  reactions: [{ senderID: null, emoji: "👍" }],
};

const ghostCount = await messagesCol.countDocuments(ghostFilter);
console.log(`[1/4] Ghost messages do usunięcia: ${ghostCount}`);

// Zbierz ID kanałów, w których są ghost messages (przed usunięciem)
const ghostChannelIDs = await messagesCol.distinct("channelID", ghostFilter);
console.log(`      Dotknięte kanały: ${ghostChannelIDs.length}`);

if (!DRY_RUN && ghostCount > 0) {
  const result = await messagesCol.deleteMany(ghostFilter);
  console.log(`      ✓ Usunięto ${result.deletedCount} ghost messages`);
} else if (ghostCount > 0) {
  console.log(`      ⏭  DRY RUN — pominięto usuwanie`);
}

// ── 2. Znajdź kanały bez wiadomości (po usunięciu ghostów) ───────────────────
console.log(`\n[2/4] Szukam kanałów bez wiadomości...`);

let orphanChannelCount = 0;
const orphanChannelIDs = [];

for (const channelID of ghostChannelIDs) {
  const remaining = await messagesCol.countDocuments({ channelID });
  if (remaining === 0) {
    orphanChannelCount++;
    orphanChannelIDs.push(channelID);
  }
}

console.log(`      Kanały bez wiadomości: ${orphanChannelCount}`);

if (!DRY_RUN && orphanChannelIDs.length > 0) {
  // Pobierz beeperChatIDs tych kanałów (do czyszczenia sync_state)
  const orphanChannels = await channelsCol.find(
    { _id: { $in: orphanChannelIDs } },
    { projection: { beeperChatID: 1 } }
  ).toArray();
  const orphanChatIDs = orphanChannels.map(c => c.beeperChatID).filter(Boolean);

  // Usuń kanały
  const delResult = await channelsCol.deleteMany({ _id: { $in: orphanChannelIDs } });
  console.log(`      ✓ Usunięto ${delResult.deletedCount} pustych kanałów`);

  // Usuń sync_state entries (zarówno REST jak i SQLite)
  if (orphanChatIDs.length > 0) {
    const syncFilter = {
      $or: [
        { chatID: { $in: orphanChatIDs } },
        { chatID: { $in: orphanChatIDs.map(id => id + ":sqlite") } },
      ],
    };
    const syncResult = await syncStateCol.deleteMany(syncFilter);
    console.log(`      ✓ Usunięto ${syncResult.deletedCount} sync_state entries`);
  }
} else if (orphanChannelIDs.length > 0) {
  console.log(`      ⏭  DRY RUN — pominięto usuwanie kanałów`);
}

// ── 3. Aktualizuj lastMessageAt na kanałach które miały ghost jako ostatnią wiadomość ─
console.log(`\n[3/4] Aktualizuję lastMessageAt na dotknietych kanałach...`);

let updatedLastMsg = 0;
const remainingChannelIDs = ghostChannelIDs.filter(id => !orphanChannelIDs.includes(id));

for (const channelID of remainingChannelIDs) {
  // Znajdź najnowszą prawdziwą wiadomość w kanale
  const latestMsg = await messagesCol.findOne(
    { channelID },
    { sort: { timestamp: -1 }, projection: { timestamp: 1 } }
  );

  if (latestMsg) {
    if (!DRY_RUN) {
      await channelsCol.updateOne(
        { _id: channelID },
        { $set: { lastMessageAt: latestMsg.timestamp } }
      );
    }
    updatedLastMsg++;
  }
}

console.log(`      Zaktualizowane kanały: ${updatedLastMsg}`);

// ── 4. Podsumowanie ──────────────────────────────────────────────────────────
console.log(`\n[4/4] Weryfikacja...`);

const remainingGhosts = await messagesCol.countDocuments(ghostFilter);
const totalMessages = await messagesCol.countDocuments({});
const totalChannels = await channelsCol.countDocuments({});

console.log(`
╔══════════════════════════════════════════════════════════╗
║  Cleanup zakończony!                                     ║
╚══════════════════════════════════════════════════════════╝
  ${DRY_RUN ? "--- DRY RUN (brak zmian) ---" : "--- LIVE ---"}
  Ghost messages usunięte:    ${DRY_RUN ? ghostCount + " (do usunięcia)" : ghostCount - remainingGhosts}
  Puste kanały usunięte:      ${DRY_RUN ? orphanChannelCount + " (do usunięcia)" : orphanChannelCount}
  Kanały z zaktualizowanym lastMessageAt: ${updatedLastMsg}
  
  Pozostałe ghost messages:   ${remainingGhosts}
  Łączna liczba wiadomości:   ${totalMessages}
  Łączna liczba kanałów:      ${totalChannels}
`);

await client.close();
