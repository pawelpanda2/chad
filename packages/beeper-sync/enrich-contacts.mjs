/**
 * enrich-contacts.mjs — Wzbogaca nazwy kontaktów których displayName to raw senderID
 * Pobiera fullName z Beeper REST API (/v1/chats/:id → participants[].fullName)
 */
import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/beeper";
const TOKEN = process.env.BEEPER_API_KEY;

if (!TOKEN) { console.error("Brak BEEPER_API_KEY"); process.exit(1); }

const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db();

function fetchChat(chatID) {
  return fetch(`http://localhost:23373/v1/chats/${encodeURIComponent(chatID)}`, {
    headers: { Authorization: `Bearer ${TOKEN}` }
  }).then(r => r.ok ? r.json() : null).catch(() => null);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const channels = await db.collection("channels").find({
  type: { $in: ["single", "direct"] },
  beeperChatID: { $exists: true }
}).toArray();

console.log(`Znaleziono ${channels.length} kanałów single/direct\n`);

let updated = 0;
let skipped = 0;

for (const ch of channels) {
  const chatInfo = await fetchChat(ch.beeperChatID);
  if (!chatInfo?.participants?.items) { skipped++; continue; }

  const others = chatInfo.participants.items.filter(p => !p.isSelf);

  for (const p of others) {
    if (!p.fullName) continue;

    const result = await db.collection("contacts").findOneAndUpdate(
      {
        "identities.senderID": p.id,
        // Tylko jeśli displayName wygląda jak raw ID (zaczyna się od @ lub numer tel.)
        $or: [
          { displayName: p.id },
          { displayName: { $regex: "^@" } },
        ]
      },
      {
        $set: {
          displayName: p.fullName,
          "identities.$[elem].senderName": p.fullName,
          updatedAt: new Date()
        }
      },
      {
        arrayFilters: [{ "elem.senderID": p.id }],
        returnDocument: "after"
      }
    );

    if (result) {
      console.log(`✓ "${p.id}" → "${p.fullName}"`);
      updated++;
    }
  }

  // Zaktualizuj tytuł kanału jeśli go brak
  if (chatInfo.title && !ch.title) {
    await db.collection("channels").updateOne(
      { _id: ch._id },
      { $set: { title: chatInfo.title } }
    );
  }

  await sleep(20);
}

console.log(`\nGotowe! Zaktualizowano: ${updated} kontaktów | Pominięto: ${skipped} niedostępnych kanałów`);
await client.close();
