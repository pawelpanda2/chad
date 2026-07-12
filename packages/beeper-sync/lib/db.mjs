/**
 * db.mjs — Połączenie MongoDB + upserty (logika identyczna jak w beeper-oplog,
 * ale wyizolowana żeby sync mógł działać niezależnie).
 */

import { MongoClient, ObjectId } from "mongodb";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/beeper";
const MY_SENDER_ID = process.env.MY_SENDER_ID ?? "";

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db();

export const contactsCol  = db.collection("contacts");
export const channelsCol  = db.collection("channels");
export const messagesCol  = db.collection("messages");
export const syncStateCol = db.collection("sync_state");

// Indeksy (idempotentne)
await channelsCol.createIndex({ beeperChatID: 1 }, { unique: true, sparse: true });
await channelsCol.createIndex({ participantIDs: 1 });
await channelsCol.createIndex({ lastMessageAt: -1 });
await contactsCol.createIndex({ 'identities.senderID': 1 }, {
  unique: true,
  // partialFilterExpression: ignoruje null i brak pola — tylko stringi są sprawdzane
  partialFilterExpression: { 'identities.senderID': { $type: 'string' } },
  name: 'identities_senderID_unique',
  sparse: false,
});

await messagesCol.createIndex(
  { beeperMessageID: 1, network: 1 },
  { unique: true, partialFilterExpression: { beeperMessageID: { $type: "string" } } }
);
await messagesCol.createIndex({ channelID: 1, timestamp: -1 });
await messagesCol.createIndex({ contactID: 1, timestamp: -1 });
// Compound index for cross-source deduplication (REST numeric IDs vs SQLite Matrix IDs)
await messagesCol.createIndex({ channelID: 1, timestamp: 1, isSelf: 1 });
await syncStateCol.createIndex({ chatID: 1 }, { unique: true });

console.log(`[db] Połączono z MongoDB: ${MONGO_URI}\n`);

export { MY_SENDER_ID, ObjectId };

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Upsertuje kanał. Jeśli istnieje — aktualizuje type/title/lastActivity.
 * Zwraca _id kanału.
 */
export async function upsertChannel(beeperChatID, network, { type, title, lastMessageAt } = {}) {
  const existing = await channelsCol.findOne({ beeperChatID });
  if (existing) {
    const upd = {};
    if (type && type !== existing.type)   upd.type  = type;
    if (title && title !== existing.title) upd.title = title;
    if (lastMessageAt) upd.lastMessageAt = lastMessageAt;
    if (Object.keys(upd).length > 0) {
      await channelsCol.updateOne({ _id: existing._id }, { $set: upd });
    }
    return existing._id;
  }

  const result = await channelsCol.insertOne({
    beeperChatID,
    network,
    type:  type  ?? "direct",
    title: title ?? null,
    participantIDs: [],
    lastMessageAt: lastMessageAt ?? null,
    createdAt: new Date(),
  });

  console.log(`[channel] Nowy: ${beeperChatID} (${network}) [${type ?? "direct"}]`);
  return result.insertedId;
}

/**
 * Upsertuje kontakt atomowo (findOneAndUpdate + upsert).
 * Unikalny index na identities.senderID gwarantuje brak duplikatów
 * nawet przy równoległych wywołaniach (REST sync concurrency=3).
 * Zwraca _id kontaktu.
 */
export async function upsertContact(senderID, senderName, network, extra = {}) {
  const displayName = extra.fullName || senderName || senderID;

  try {
    // Atomowy upsert — jeśli dokument z tym senderID istnieje: tylko uzupełnij brakujące pola.
    // Jeśli nie istnieje: wstaw nowy.
    const result = await contactsCol.findOneAndUpdate(
      { 'identities.senderID': senderID },
      {
        $setOnInsert: {
          displayName,
          notes:      '',
          bio:        '',
          tags:       [],
          avatarURL:  extra.imgURL  || null,
          identities: [{ network, senderID, senderName: senderName || '', username: extra.username || '' }],
          createdAt:  new Date(),
          updatedAt:  new Date(),
        },
      },
      {
        upsert:         true,
        returnDocument: 'after',
      }
    );

    const doc = result; // findOneAndUpdate zwraca dokument (lub null przy insercie z upsert)
    if (!doc) {
      // Fallback — nieoczekiwany brak dokumentu po upsert
      const found = await contactsCol.findOne({ 'identities.senderID': senderID });
      return found._id;
    }

    // Wzbogać istniejący rekord o brakujące pola (nieatomowo, ale to tylko additive update)
    const upd = {};
    if (extra.fullName && doc.displayName === senderID) upd.displayName = extra.fullName;
    if (extra.imgURL   && !doc.avatarURL)               upd.avatarURL   = extra.imgURL;
    if (Object.keys(upd).length) {
      upd.updatedAt = new Date();
      await contactsCol.updateOne({ _id: doc._id }, { $set: upd });
    }

    return doc._id;

  } catch (err) {
    // Duplicate key error (E11000) — może wystąpić przy bardzo wysokiej concurrency
    // mimo upsert (MongoDB race w tworzeniu indeksu). Fallback: po prostu pobierz istniejący.
    if (err.code === 11000) {
      const found = await contactsCol.findOne({ 'identities.senderID': senderID });
      if (found) return found._id;
    }
    throw err;
  }
}

/**
 * Dodaje contactID do participantIDs kanału jeśli go tam nie ma.
 */
export async function addParticipant(channelID, contactID) {
  await channelsCol.updateOne(
    { _id: channelID },
    { $addToSet: { participantIDs: contactID } }
  );
}

/**
 * Upsertuje wiadomość. Zwraca { inserted: bool }.
 *
 * Strategia deduplicacji (chroni przed duplikatami z różnych źródeł):
 *   1. Jeśli beeperMessageID istnieje → szukaj po (beeperMessageID, network)
 *   2. Fallback cross-source check → szukaj po (channelID, timestamp, isSelf)
 *      To łapie przypadki gdzie REST API wysyła numeryczne ID (np. "44632")
 *      a SQLite ma Matrix event ID (np. "$BZ1JLguBxwb...") dla tej samej wiadomości.
 */
export async function upsertMessage(doc) {
  // Ignoruj puste wiadomości tekstowe bez załączników
  const isEmptyText = (doc.type === "TEXT" || !doc.type) && !doc.text && (!doc.attachments || doc.attachments.length === 0);
  if (isEmptyText) {
    return { inserted: false };
  }
  // Jeśli nie ma beeperMessageID — sprawdź po (channel, ts, isSelf) zanim insertuj
  if (!doc.beeperMessageID) {
    if (doc.channelID && doc.timestamp) {
      const crossMatch = await messagesCol.findOne({
        channelID: doc.channelID,
        timestamp: doc.timestamp,
        isSelf:    doc.isSelf,
      });
      if (crossMatch) {
        // Już istnieje — zaktualizuj tylko pola których brakuje
        const upd = {};
        if (!crossMatch.attachments?.length && doc.attachments?.length) upd.attachments = doc.attachments;
        if (!crossMatch.reactions?.length  && doc.reactions?.length)   upd.reactions   = doc.reactions;
        if (Object.keys(upd).length) {
          upd.updatedAt = new Date();
          await messagesCol.updateOne({ _id: crossMatch._id }, { $set: upd });
        }
        return { inserted: false };
      }
    }
    await messagesCol.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
    return { inserted: true };
  }

  // Wiadomość z beeperMessageID — szukaj po ID
  const filter = { beeperMessageID: doc.beeperMessageID, network: doc.network };
  const existing = await messagesCol.findOne(filter);
  if (existing) {
    await messagesCol.updateOne({ _id: existing._id }, { $set: { ...doc, updatedAt: new Date() } });
    return { inserted: false };
  }

  // Cross-source check: czy już mamy tę wiadomość z innym ID (np. numerycznym)
  if (doc.channelID && doc.timestamp) {
    const crossMatch = await messagesCol.findOne({
      channelID: doc.channelID,
      timestamp: doc.timestamp,
      isSelf:    doc.isSelf,
      $or: [
        { beeperMessageID: doc.beeperMessageID },
        { beeperMessageID: { $not: /^\$/ } } // only match if the existing one is a numeric/REST ID
      ]
    });
    if (crossMatch) {
      // Istniejący dokument ma inny beeperMessageID (inny system ID)
      // Preferuj Matrix ID ($...) nad numerycznym
      const incomingIsMatrix  = doc.beeperMessageID?.startsWith("$");
      const existingIsMatrix  = crossMatch.beeperMessageID?.startsWith("$");

      if (incomingIsMatrix && !existingIsMatrix) {
        // Nadpisz ID numeryczny Matrix ID — Matrix ID jest bardziej stabilny
        await messagesCol.updateOne(
          { _id: crossMatch._id },
          { $set: {
            beeperMessageID: doc.beeperMessageID,
            ...(doc.attachments?.length ? { attachments: doc.attachments } : {}),
            ...(doc.reactions?.length   ? { reactions:   doc.reactions   } : {}),
            updatedAt: new Date()
          }}
        );
        return { inserted: false };
      }
      // Zachowaj istniejący (jest co najmniej tak dobry jak przychodzący)
      return { inserted: false };
    }
  }

  await messagesCol.insertOne({ ...doc, createdAt: new Date(), updatedAt: new Date() });
  return { inserted: true };
}

/**
 * Dodaje/aktualizuje reakcję emoji na wskazanej wiadomości.
 */
export async function upsertReaction(channelID, linkedMessageID, network, senderID, emoji) {
  const targetMsg = await messagesCol.findOne({
    beeperMessageID: String(linkedMessageID),
    channelID,
  });
  if (!targetMsg) {
    // wiadomość może jeszcze nie być zapisana — to normalne przy paginacji wstecz
    return;
  }

  const existing = targetMsg.reactions ?? [];
  const withoutSender = existing.filter(r => r.senderID !== senderID);
  const updated = [...withoutSender, { senderID, emoji }];

  await messagesCol.updateOne(
    { _id: targetMsg._id },
    { $set: { reactions: updated, updatedAt: new Date() } }
  );
}

/**
 * Pobiera stan synchronizacji dla danego chatID.
 */
export async function getSyncState(chatID) {
  return syncStateCol.findOne({ chatID });
}

/**
 * Zapisuje/aktualizuje stan synchronizacji.
 */
export async function setSyncState(chatID, data) {
  await syncStateCol.updateOne(
    { chatID },
    { $set: { chatID, ...data, updatedAt: new Date() } },
    { upsert: true }
  );
}

export async function closeDb() {
  await client.close();
}
