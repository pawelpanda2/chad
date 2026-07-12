/**
 * sqlite-sync.mjs — Import pełnej historii z lokalnej bazy SQLite BeeperTexts.
 *
 * Beeper przechowuje lokalnie 45k+ wiadomości w:
 *   ~/Library/Application Support/BeeperTexts/index.db
 *
 * Kolekcje:
 *   mx_room_messages — wszystkie wiadomości (TEXT, IMAGE, REACTION, etc.)
 *   mx_reactions     — reakcje (emoji) na wiadomościach
 *   threads          — metadane chatów (type, title, participants)
 *   participant_identifiers — mapowanie senderContactID → senderName, network
 *
 * Strategia:
 *   Czytamy całą bazę przez child_process.exec (sqlite3 CLI) z PRAGMA busy_timeout
 *   bo baza jest locked przez żywy Beeper w WAL mode.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { homedir } from "os";
import { join } from "path";

import {
  channelsCol,
  messagesCol,
  contactsCol,
  upsertChannel,
  upsertContact,
  addParticipant,
  upsertMessage,
  setSyncState,
  getSyncState,
  closeDb,
  MY_SENDER_ID,
  ObjectId,
} from "./db.mjs";

const execFileAsync = promisify(execFile);

// Path comes from BEEPER_SQLITE_PATH (see .env.mac-beeper.example) — falls
// back to the default macOS location so the script still works with zero
// config on a fresh Mac checkout.
const SQLITE_DB = process.env.BEEPER_SQLITE_PATH
  || join(homedir(), "Library/Application Support/BeeperTexts/index.db");
const SQLITE3   = "sqlite3";

const BATCH_SIZE = 500; // wiadomości przetwarzane na raz z SQLite

/**
 * Wykonuje zapytanie SQLite przez CLI, zwraca tablicę obiektów.
 */
async function sqliteQuery(sql) {
  // sqlite3 argv: sqlite3 -json <dbpath> <sql>
  // PRAGMA busy_timeout musi być w tym samym stringu SQL
  const fullSQL = `PRAGMA busy_timeout=5000; ${sql}`;

  const { stdout, stderr } = await execFileAsync(
    SQLITE3,
    ["-json", SQLITE_DB, fullSQL],
    { maxBuffer: 100 * 1024 * 1024 } // 100 MB buffer
  ).catch(err => {
    if (err.stdout && err.stdout.trim().length > 0) return { stdout: err.stdout, stderr: err.stderr || "" };
    throw err;
  });

  if (!stdout || stdout.trim() === "") return [];
  // sqlite3 -json może zwrócić wiele bloków JSON jeśli PRAGMA też coś zwraca
  // Przetwarzamy tylko ostatni poprawny blok []
  const chunks = stdout.trim().split(/\]\s*\[/).map((c, i, arr) => {
    if (i === 0) return c + (arr.length > 1 ? "]" : "");
    if (i === arr.length - 1) return "[" + c;
    return "[" + c + "]";
  });
  const lastChunk = chunks[chunks.length - 1];
  try {
    return JSON.parse(lastChunk);
  } catch {
    // Spróbuj przeparsować cały output
    try { return JSON.parse(stdout); } catch {}
    console.error("[sqlite] Parse error. Stderr:", stderr?.slice(0, 200));
    return [];
  }
}



/**
 * Pobiera metadane wszytskich chatów z tabeli `threads`.
 */
async function fetchThreads() {
  const rows = await sqliteQuery(
    `SELECT threadID, accountID, thread FROM threads WHERE is_label = 0`
  );
  return rows.map(r => {
    let meta = {};
    try { meta = JSON.parse(r.thread); } catch {}
    return {
      beeperChatID: r.threadID,
      network: r.accountID,
      type: meta.type || "direct",
      title: meta.title || null,
      lastMessageAt: meta.timestamp ? new Date(meta.timestamp) : null,
    };
  });
}

/**
 * Pobiera mapowanie participant_id → identifier (e.g. numer telefonu / username).
 * Używamy tego do wzbogacenia kontaktów w MongoDB — nie żełby o displayName (sqlite nie ma).
 * Display names są wyciągane z poll `senderName` w beeper_events lub REST API.
 */
async function fetchParticipants() {
  const rows = await sqliteQuery(
    `SELECT account_id, participant_id, identifier, identifier_type FROM participant_identifiers`
  );
  const map = new Map(); // key: participant_id → { identifier, account_id }
  for (const r of rows) {
    if (!map.has(r.participant_id)) {
      map.set(r.participant_id, { identifier: r.identifier, network: r.account_id });
    }
  }
  return map;
}

/**
 * Pobiera reakcje z tabeli mx_reactions.
 * Schemat: messageID, senderContactID (lub reactorID), reactionKey
 */
async function fetchReactions() {
  // Sprawdzamy rzeczywiste kolumny — schema może się różnić między wersjami BeeperTexts
  const cols = await sqliteQuery(`PRAGMA table_info(mx_reactions)`);
  const colNames = cols.map(c => c.name);
  const senderCol = colNames.includes("senderContactID") ? "senderContactID"
                  : colNames.includes("senderID")        ? "senderID"
                  : colNames.includes("reactorID")       ? "reactorID"
                  : colNames.includes("sender")          ? "sender"
                  : "senderID";
  const keyCol    = colNames.includes("reactionKey")  ? "reactionKey"
                  : colNames.includes("description")  ? "description"
                  : colNames.includes("emoji")         ? "emoji"
                  : "description";
  const msgCol    = colNames.includes("messageID") ? "messageID"
                  : colNames.includes("eventID")   ? "eventID"
                  : colNames.includes("targetID")  ? "targetID"
                  : "eventID";

  const rows = await sqliteQuery(
    `SELECT ${msgCol} as msgID, ${senderCol} as senderID, ${keyCol} as emoji FROM mx_reactions`
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.msgID)) map.set(r.msgID, []);
    map.get(r.msgID).push({ senderID: r.senderID, emoji: r.emoji || "👍" });
  }
  return map;
}

/**
 * Pobiera wiadomości dla konkretnego roomID (batchowo).
 * @param {string} roomID
 * @param {number} offset
 * @param {number} limit
 * @param {number|null} sinceTimestamp — jeśli podane, pobiera tylko wiadomości nowsze niż ten timestamp (ms)
 */
async function fetchMessages(roomID, offset, limit, sinceTimestamp = null) {
  const sinceClause = sinceTimestamp
    ? `  AND timestamp > ${sinceTimestamp} `
    : '';
  return sqliteQuery(
    `SELECT ` +
    `  roomID, eventID, senderContactID, timestamp, type, isSentByMe, ` +
    `  protocol, hsOrder, message, isDeleted, text_content, text_formattedContent ` +
    `FROM mx_room_messages ` +
    `WHERE roomID = '${roomID.replace(/'/g, "''")}' ` +
    `  AND type NOT IN ('HIDDEN', 'MEMBERSHIP', 'NOTICE', 'TOMBSTONE', '') ` +
    `${sinceClause}` +
    `ORDER BY timestamp ASC ` +
    `LIMIT ${limit} OFFSET ${offset}`
  );
}

/**
 * Wyciąga tekst z pola message (JSON blob).
 */
function extractText(row) {
  if (row.text_content) return row.text_content;
  if (!row.message) return "";
  try {
    const m = JSON.parse(row.message);
    // Main text fields
    const text = m.text || m.content?.body || m.body || "";
    if (text) return text;
    // Fallback: attachment captions (images/videos may have caption in extra)
    for (const att of (m.attachments ?? [])) {
      const caption = att.extra?.caption;
      if (caption) return caption;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Wyciąga załączniki (images, video, audio, files) z pola message (JSON blob).
 * Zwraca tablicę obiektów kompatybilnych z formatem REST API.
 */
function extractAttachments(row) {
  if (!row.message) return [];
  try {
    const m = JSON.parse(row.message);
    const atts = m.attachments;
    if (!Array.isArray(atts) || atts.length === 0) return [];
    return atts.map(a => ({
      type:     a.type     ?? null,
      mimeType: a.mimeType ?? null,
      fileName: a.fileName ?? null,
      fileSize: a.fileSize ?? null,
      srcURL:   a.srcURL || a.id || null,
      size:     a.size ?? null,
      isGif:    a.isGif ?? false,
    })).filter(a => a.srcURL); // only keep attachments with a resolvable URL
  } catch {
    return [];
  }
}

/**
 * Główna funkcja importu — czyta całą bazę SQLite i zapisuje do MongoDB.
 */
export async function runSqliteSync({ force = false } = {}) {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║       Beeper Historical Sync (SQLite Local DB)           ║
╚══════════════════════════════════════════════════════════╝
Źródło: ${SQLITE_DB}
Tryb: ${force ? "FORCE (pełny re-import)" : "incremental"}
`);

  // 1. Pobierz metadane chatów
  console.log("[sqlite] Ładuję metadane chatów...");
  const threads = await fetchThreads();
  console.log(`[sqlite] Znaleziono ${threads.length} chatów\n`);

  // 2. Pobierz mapę uczestników
  console.log("[sqlite] Ładuję uczestników...");
  const participantMap = await fetchParticipants();
  console.log(`[sqlite] Znaleziono ${participantMap.size} unikalnych uczestników\n`);

  // 3. Pobierz reakcje
  console.log("[sqlite] Ładuję reakcje...");
  const reactionsMap = await fetchReactions();
  console.log(`[sqlite] Znaleziono ${reactionsMap.size} wiadomości z reakcjami\n`);

  // 4. Synchronizuj każdy czat
  let totalInserted = 0;
  let totalUpdated  = 0;
  let totalSkipped  = 0;
  let chatsProcessed = 0;

  for (const thread of threads) {
    const { beeperChatID, network, type, title, lastMessageAt } = thread;

    // Sprawdź stan synchronizacji
    const state = force ? null : await getSyncState(beeperChatID + ":sqlite");

    // Dla kanałów fully_synced — pobierz tylko nowe wiadomości od ostatniego syncu
    // (catch-up mode). sinceTimestamp = timestamp ostatniego syncu w ms.
    let sinceTimestamp = null;
    let isCatchUp = false;
    if (state?.status === "fully_synced" && !force) {
      sinceTimestamp = state.syncedAt ? state.syncedAt.getTime() : null;
      if (!sinceTimestamp) {
        totalSkipped++;
        continue;
      }
      isCatchUp = true;
    }

    // Upsert kanał
    const channelID = await upsertChannel(beeperChatID, network, { type, title, lastMessageAt });

    // Pobierz wiadomości batchowo
    let offset = 0;
    let batchInserted = 0;
    let batchUpdated  = 0;

    const modeLabel = isCatchUp ? "catch-up" : type;
    process.stdout.write(`[sqlite] ${beeperChatID.slice(0, 30)}... (${modeLabel})`);

    while (true) {
      const rows = await fetchMessages(beeperChatID, offset, BATCH_SIZE, sinceTimestamp);
      if (rows.length === 0) break;

      for (const row of rows) {
        const {
          roomID,
          eventID,
          senderContactID,
          timestamp,
          type: msgType,
          isSentByMe,
          hsOrder,
          isDeleted,
        } = row;

        // Pomiń reakcje — obsługujemy je przez reactionsMap
        if (msgType === "REACTION") continue;

        const isSelf = Boolean(isSentByMe) || senderContactID === MY_SENDER_ID || senderContactID === "@gustawdaniel:beeper.com";
        const ts = timestamp ? new Date(Number(timestamp)) : new Date();

        // Upsert kontaktu
        let contactID = null;
        if (!isSelf && senderContactID) {
          const participantInfo = participantMap.get(senderContactID);
          const displayName = participantInfo?.displayName || senderContactID;
          contactID = await upsertContact(senderContactID, displayName, network);
          await addParticipant(channelID, contactID);
        }

        // Pobierz tekst
        const text = extractText(row);

        // Pobierz załączniki (images, video, audio, files)
        const attachments = extractAttachments(row);

        // Pobierz reakcje na tę wiadomość
        const reactions = (reactionsMap.get(eventID) || []);

        // Upsert wiadomości
        // Używamy eventID jako beeperMessageID (Matrix event ID)
        const { inserted } = await upsertMessage({
          beeperMessageID: eventID,
          channelID,
          contactID,
          isSelf,
          network,
          type: msgType || "TEXT",
          text,
          reactions,
          attachments,
          timestamp: ts,
          isUnread: false,
          deletedAt: isDeleted ? ts : null,
          sortKey: hsOrder || null,
        });

        if (inserted) batchInserted++; else batchUpdated++;
      }

      offset += rows.length;
      process.stdout.write(` ${offset}...`);
      if (rows.length < BATCH_SIZE) break;
    }

    // Pomiń logi dla catch-up bez zmian
    if (isCatchUp && batchInserted === 0 && batchUpdated === 0) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r'); // wyczyść linię
      totalSkipped++;
    } else {
      console.log(` ✓ +${batchInserted} nowych, ~${batchUpdated} zaktualizowanych`);
      chatsProcessed++;
    }

    await setSyncState(beeperChatID + ":sqlite", {
      status: "fully_synced",
      totalMessages: (state?.totalMessages ?? 0) + batchInserted,
      syncedAt: new Date(),
    });

    totalInserted += batchInserted;
    totalUpdated  += batchUpdated;
  }

  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Import SQLite zakończony!                               ║
╚══════════════════════════════════════════════════════════╝
  Przetworzone czaty:   ${chatsProcessed}
  Pominięte (up-to-date): ${totalSkipped}
  Nowe wiadomości:      ${totalInserted}
  Zaktualizowane:       ${totalUpdated}
`);

  await closeDb();
}
