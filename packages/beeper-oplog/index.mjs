import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import { resolveOwnerRepoGuid, ownerDatabaseName, redactMongoUri } from "./owner-db.mjs";

// Runs on QNAP inside docker-compose — env comes from the container's env,
// dotenv.config() here only helps when running this script locally for
// debugging (no path override, unlike the Mac-only beeper-ws/beeper-sync).
dotenv.config();

// ── Config ────────────────────────────────────────────────────────────────────
// Server URI only — no database segment. The database name always comes
// from ownerDatabaseName(repoGuid) below, never from this URI's own
// default/path segment.
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const MY_SENDER_ID = process.env.MY_SENDER_ID ?? "";
const repoGuid = resolveOwnerRepoGuid();
// Beeper Desktop's local REST API — only reachable when this process runs on
// the same Mac as Beeper Desktop. On QNAP (the intended runtime) there is no
// Beeper Desktop, so fetchBeeperChat() below fails fast and falls back to
// defaults (type: "direct", title: null) — chat metadata enrichment is
// best-effort, never required for the change-stream pipeline to work.
const BEEPER_REST_URL = process.env.BEEPER_REST_URL || "http://localhost:23373";

if (!MY_SENDER_ID) {
  console.warn("[warn] MY_SENDER_ID nie ustawiony w .env — wiadomości wychodzące będą miały isSelf=false");
}

// ── DB ────────────────────────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URI);
await client.connect();
const DB_NAME = ownerDatabaseName(repoGuid);
const db = client.db(DB_NAME);
console.log(`[beeper-oplog] MongoDB: ${redactMongoUri(MONGO_URI)} (owner repoGuid: ${repoGuid}, database: ${DB_NAME})`);

const eventsCol   = db.collection("beeper_events");
const contactsCol = db.collection("contacts");
const channelsCol = db.collection("channels");
const messagesCol = db.collection("messages");

// Indeksy (idempotentne)
await contactsCol.createIndex({ "identities.senderID": 1 });
await contactsCol.createIndex({ tags: 1 });
await channelsCol.createIndex({ beeperChatID: 1 }, { unique: true, sparse: true });
await channelsCol.createIndex({ participantIDs: 1 });
await channelsCol.createIndex({ lastMessageAt: -1 });
await messagesCol.createIndex(
  { beeperMessageID: 1, network: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { beeperMessageID: { $type: "string" } } 
  }
);
await messagesCol.createIndex({ channelID: 1, timestamp: -1 });
await messagesCol.createIndex({ contactID: 1, timestamp: -1 });
// Compound index for cross-source deduplication (REST numeric IDs vs SQLite Matrix IDs)
await messagesCol.createIndex({ channelID: 1, timestamp: 1, isSelf: 1 });

console.log(`[oplog] Połączono z MongoDB: ${MONGO_URI}`);
console.log(`[oplog] Nasłuchuję na beeper_events...\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Zwraca istniejący kontakt lub tworzy nowy "unknown" na podstawie senderID.
 */
async function upsertContact(senderID, senderName, network) {
  const doc = await contactsCol.findOneAndUpdate(
    { "identities.senderID": senderID },
    {
      $setOnInsert: {
        displayName: senderName || senderID,
        notes: "",
        tags: [],
        identities: [{ network, senderID, senderName: senderName || "" }],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    },
    { upsert: true, returnDocument: "after" }
  );

  return doc.value ? doc.value._id : doc._id;
}

/**
 * Pobiera metadane kanału z Beeper API (REST)
 */
async function fetchBeeperChat(beeperChatID) {
  const token = process.env.BEEPER_API_KEY;
  if (!token) return null;
  try {
    const res = await fetch(`${BEEPER_REST_URL}/v1/chats/${encodeURIComponent(beeperChatID)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error(`[error] fetchBeeperChat dla ${beeperChatID}:`, err.message);
    return null;
  }
}

/**
 * Zwraca istniejący channel lub tworzy nowy na podstawie beeperChatID.
 */
async function upsertChannel(beeperChatID, network) {
  const existing = await channelsCol.findOne({ beeperChatID });
  if (existing) return existing._id;

  let type = "direct";
  let title = null;

  const chatInfo = await fetchBeeperChat(beeperChatID);
  if (chatInfo) {
    type = chatInfo.type || type;
    title = chatInfo.title || title;
  }

  try {
    const result = await channelsCol.insertOne({
      beeperChatID,
      network,
      type,
      title,
      participantIDs: [],
      lastMessageAt: null,
      createdAt: new Date(),
    });

    console.log(`[channel] Nowy kanał: ${beeperChatID} (${network}) [typ: ${type}] → ${result.insertedId}`);
    return result.insertedId;
  } catch (err) {
    if (err.code === 11000) {
      // Race condition occured, fetch the already created channel
      const raceExisting = await channelsCol.findOne({ beeperChatID });
      if (raceExisting) return raceExisting._id;
    }
    throw err;
  }
}

/**
 * Dodaje contactID do participantIDs kanału (jeśli jeszcze nie ma).
 * Uwaga: Typ "group" może już być ustawiony z REST API Beepera,
 * więc aktualizujemy tu typ awaryjnie w razie potrzeby.
 */
async function addParticipant(channelID, contactID, lastMessageAt) {
  const channel = await channelsCol.findOne({ _id: channelID });
  const alreadyIn = channel?.participantIDs.some(id => id.equals(contactID));

  const update = { $set: { lastMessageAt } };
  if (!alreadyIn) {
    update.$addToSet = { participantIDs: contactID };
  }

  await channelsCol.updateOne({ _id: channelID }, update);

  // Zmień typ na group awaryjnie jeśli uczestników jest więcej niż 1
  const updated = await channelsCol.findOne({ _id: channelID });
  if (updated.participantIDs.length > 1 && updated.type === "direct") {
    await channelsCol.updateOne({ _id: channelID }, { $set: { type: "group" } });
    console.log(`[channel] Zmieniono typ na "group" (via participantIDs): ${channelID}`);
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleMessageUpserted(event) {
  const entries = event.entries ?? [];

  for (const entry of entries) {
    const {
      id: beeperMessageID,
      chatID,
      accountID: network,
      senderID,
      senderName,
      timestamp,
      type,
      text,
      reactions = [],
      linkedMessageID,
      isSender,
      isUnread = false,
    } = entry;

    const isSelf = isSender || senderID === MY_SENDER_ID;
    const ts = timestamp ? new Date(timestamp) : new Date();

    // Jeśli wiadomość została usunięta, ukryta lub jest pusta: usuń ją i pomiń
    const isDeletedOrHidden = entry.isDeleted || entry.isHidden;
    const isEmptyText = (type === "TEXT" || !type) && !text && (!entry.attachments || entry.attachments.length === 0);
    if (isDeletedOrHidden || isEmptyText) {
      if (beeperMessageID) {
        await messagesCol.deleteOne({ beeperMessageID, network });
      }
      continue;
    }

    // ── Specjalny przypadek: to jest reakcja, NIE nowa wiadomość ────────────
    if (type === "REACTION" && linkedMessageID) {
      // Znajdź channel (potrzebny do wyszukania wiadomości)
      const channel = await channelsCol.findOne({ beeperChatID: chatID });
      if (channel) {
        // Znajdź wiadomość, do której dodano reakcję
        const targetMsg = await messagesCol.findOne({
          beeperMessageID: String(linkedMessageID),
          channelID: channel._id,
        });
        if (targetMsg) {
          // Upewnij się, że reakcja od tego senderID jest zapisana (upsert po senderID)
          const existingReactions = targetMsg.reactions ?? [];
          const reactionEmoji = entry.reactionKey ?? entry.emoji ?? "👍";
          const withoutSender = existingReactions.filter(r => r.senderID !== senderID);
          const updatedReactions = [...withoutSender, { senderID, emoji: reactionEmoji }];

          await messagesCol.updateOne(
            { _id: targetMsg._id },
            { $set: { reactions: updatedReactions, updatedAt: new Date() } }
          );
          console.log(`[reaction] ${senderName ?? senderID} → ${reactionEmoji} na wiadomości ${linkedMessageID}`);
        } else {
          console.log(`[reaction] Nie znaleziono wiadomości ${linkedMessageID} w kanale ${chatID}`);
        }
      }
      // Nie zapisuj REACTION jako osobnej wiadomości — skip!
      continue;
    }

    // 1. Channel
    const channelID = await upsertChannel(chatID, network);

    // 2. Contact (tylko jeśli to nie my)
    let contactID = null;
    if (!isSelf && senderID) {
      contactID = await upsertContact(senderID, senderName, network);
      await addParticipant(channelID, contactID, ts);
    } else {
      // Nasza wiadomość — zaktualizuj tylko lastMessageAt
      await channelsCol.updateOne(
        { _id: channelID },
        { $set: { lastMessageAt: ts } }
      );
    }

    // 3. Message — upsert z cross-source deduplicacją
    // (ta sama wiadomość może mieć numeryczne ID z REST i Matrix ID z SQLite)
    const mappedReactions = reactions.map(r => ({
      senderID: r.participantID ?? r.id,
      emoji: r.reactionKey ?? r.emoji ?? "",
    }));

    const doc = {
      beeperMessageID: beeperMessageID ?? null,
      channelID,
      contactID,
      isSelf,
      network,
      type: type ?? "TEXT",
      text: text ?? "",
      reactions: mappedReactions,
      timestamp: ts,
      isUnread,
      deletedAt: null,
      updatedAt: new Date(),
    };

    // Szukaj po beeperMessageID
    const byMsgID = beeperMessageID
      ? await messagesCol.findOne({ beeperMessageID, network })
      : null;

    if (byMsgID) {
      await messagesCol.updateOne({ _id: byMsgID._id }, { $set: doc });
      continue; // zaktualizowano — przejdź do kolejnej wiadomości
    }

    // Cross-source check: ta sama wiadomość może już istnieć z Matrix ID z SQLite
    const crossMatch = await messagesCol.findOne({
      channelID,
      timestamp: ts,
      isSelf,
    });

    if (crossMatch) {
      // Już istnieje (z innym ID z SQLite) — nie insertuj duplikatu
      // Preferuj Matrix ID jeśli crossMatch już go ma
      const incoming  = beeperMessageID;
      const inMatrix  = crossMatch.beeperMessageID?.startsWith("$");
      if (!inMatrix && incoming) {
        // crossMatch ma numeryczny ID — zaktualizuj go do incoming (może być lepszy)
        await messagesCol.updateOne({ _id: crossMatch._id }, { $set: { ...doc } });
      }
      continue;
    }

    // Nowa wiadomość — insert
    await messagesCol.insertOne({ ...doc, createdAt: new Date() });
    const who = isSelf ? "TY" : senderName;
    console.log(`[message] Nowa: [${network}] ${who}: "${(text ?? "").slice(0, 60)}"`);
  }
}

async function handleMessageDeleted(event) {
  const { chatID, ids = [], ts } = event;

  // Znajdź channel po beeperChatID
  const channel = await channelsCol.findOne({ beeperChatID: chatID });
  if (!channel) return;

  for (const msgID of ids) {
    const result = await messagesCol.updateOne(
      { beeperMessageID: String(msgID), channelID: channel._id },
      { $set: { deletedAt: ts ? new Date(ts) : new Date() } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[message] Soft-delete: ${msgID} w ${chatID}`);
    }
  }
}

async function handleChatUpserted(event) {
  const { chatID, ts } = event;
  const channel = await channelsCol.findOne({ beeperChatID: chatID });
  if (!channel) return;

  const update = { lastMessageAt: ts ? new Date(ts) : new Date() };

  // Dociągnij najświeższe metadane (np. tytuł, type group/direct) z Beeper API
  const chatInfo = await fetchBeeperChat(chatID);
  if (chatInfo) {
    if (chatInfo.type) update.type = chatInfo.type;
    if (chatInfo.title) update.title = chatInfo.title;
  }

  await channelsCol.updateOne(
    { _id: channel._id },
    { $set: update }
  );
  console.log(`[channel] Upsert (${chatID}): typ=${update.type || channel.type}, title="${update.title || channel.title}"`);
}

// ── Change Stream ─────────────────────────────────────────────────────────────

const stream = eventsCol.watch(
  [{ $match: { operationType: "insert" } }],
  { fullDocument: "updateLookup" }
);

stream.on("change", async (change) => {
  const event = change.fullDocument;
  if (!event) return;

  try {
    switch (event.type) {
      case "message.upserted":
        await handleMessageUpserted(event);
        break;
      case "message.deleted":
        await handleMessageDeleted(event);
        break;
      case "chat.upserted":
        await handleChatUpserted(event);
        break;
      default:
        // ready, subscriptions.updated — ignorujemy
        break;
    }
  } catch (err) {
    console.error(`[error] ${event.type}:`, err.message);
  }
});

stream.on("error", (err) => {
  console.error("[stream error]", err.message);
});

process.on("SIGINT", async () => {
  console.log("\n[oplog] Zamykam...");
  await stream.close();
  await client.close();
  process.exit(0);
});
