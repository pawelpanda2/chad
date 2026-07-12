/**
 * beeper-sync/index.mjs — Orkiestrator historycznego importu.
 *
 * Strategia:
 * 1. Tryb REST (domyślny): pobiera chaty z Beeper API REST + istniejące z MongoDB
 * 2. Tryb SQLite (--sqlite): czyta PEŁNĄ historię z lokalnej bazy BeeperTexts/index.db
 *
 * Uruchomienie:
 *   node index.mjs              — REST sync (nowe wiadomości z Beeper API)
 *   node index.mjs --force      — REST sync (ignoruje stan synchronizacji)
 *   node index.mjs --sqlite     — Import z lokalnego SQLite (pełna historia)
 *   node index.mjs --sqlite --force — Pełny re-import z SQLite
 */

import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

const FORCE  = process.argv.includes("--force");
const SQLITE = process.argv.includes("--sqlite");

if (SQLITE) {
  const { runSqliteSync } = await import("./lib/sqlite-sync.mjs");
  await runSqliteSync({ force: FORCE });
} else {
  const { setToken, fetchAllChats, sleep, DELAY_MS } = await import("./lib/beeper-api.mjs");
  const { channelsCol, closeDb } = await import("./lib/db.mjs");
  const { syncChannel } = await import("./lib/sync-channel.mjs");

  const TOKEN = process.env.BEEPER_API_KEY;
  if (!TOKEN) {
    console.error("[sync] Brak BEEPER_API_KEY w .env");
    process.exit(1);
  }
  setToken(TOKEN);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║         Beeper Historical Sync (REST API)                ║
╚══════════════════════════════════════════════════════════╝
Tryb: ${FORCE ? "FORCE (pełny re-sync)" : "incremental"}
`);

  const inboxChats = await fetchAllChats();
  const knownChannels = await channelsCol.find({}, { projection: { beeperChatID: 1 } }).toArray();
  const knownChatIDs  = new Set(knownChannels.map(c => c.beeperChatID).filter(Boolean));
  const inboxChatIDs  = new Set(inboxChats.map(c => c.id));
  const allChatIDs    = new Set([...inboxChatIDs, ...knownChatIDs]);

  console.log(`[sync] Faza 1: Enumeracja chatów...`);
  console.log(`       Inbox: ${inboxChatIDs.size} | MongoDB: ${knownChatIDs.size} | Łącznie: ${allChatIDs.size}\n`);
  console.log(`[sync] Faza 2: Synchronizacja wiadomości...\n`);

  const chatIDsArray = [...allChatIDs];
  let processed = 0, totalNew = 0, totalSkip = 0;
  const CONCURRENCY = 3;

  async function processQueue(ids) {
    const queue = [...ids];
    async function worker() {
      while (queue.length > 0) {
        const chatID = queue.shift();
        if (!chatID) break;
        try {
          const result = await syncChannel(chatID, { force: FORCE });
          processed++;
          if (result.skipped) totalSkip++; else totalNew += result.totalInserted ?? 0;
        } catch (err) {
          console.error(`\n[sync] ✗ Błąd dla ${chatID}: ${err.message}`);
          processed++;
        }
        await sleep(DELAY_MS);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  }

  await processQueue(chatIDsArray);

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Synchronizacja REST zakończona!                         ║
╚══════════════════════════════════════════════════════════╝
  Przetworzone kanały:  ${processed}
  Pominięte (up-to-date): ${totalSkip}
  Nowe wiadomości:      ${totalNew}
`);

  await closeDb();
}

process.exit(0);
