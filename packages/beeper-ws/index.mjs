import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });
import WebSocket from "ws";
import { MongoClient } from "mongodb";
import { resolveOwnerRepoGuid, ownerDatabaseName, redactMongoUri } from "./owner-db.mjs";

// ── Env ──────────────────────────────────────────────────────────────────────
const TOKEN = process.env.BEEPER_API_KEY;
// Server URI only — no database segment. The database name always comes
// from ownerDatabaseName(repoGuid) below, never from this URI's own
// default/path segment.
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";

if (!TOKEN) {
  console.error("Brak BEEPER_API_KEY w pliku .env");
  process.exit(1);
}

const repoGuid = resolveOwnerRepoGuid();

// ── MongoDB ──────────────────────────────────────────────────────────────────
const mongoClient = new MongoClient(MONGO_URI);
await mongoClient.connect();
const DB_NAME = ownerDatabaseName(repoGuid);
const db = mongoClient.db(DB_NAME);
const events = db.collection("beeper_events");
console.log(`MongoDB: połączono z ${redactMongoUri(MONGO_URI)} (owner repoGuid: ${repoGuid}, database: ${DB_NAME})`);

// Indeks po typie i sekwencji – przydatny do późniejszego querowania
await events.createIndex({ type: 1 });
await events.createIndex({ seq: 1 }, { sparse: true });
await events.createIndex({ chatID: 1 }, { sparse: true });

// ── WebSocket ────────────────────────────────────────────────────────────────
const WS_URL = process.env.BEEPER_WS_URL || "ws://localhost:23373/v1/ws";
console.log(`Łączę się z ${WS_URL}...`);

const ws = new WebSocket(WS_URL, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});

ws.on("open", () => {
  console.log("Połączono z Beeper! Subskrybuję wszystkie chaty...\n");
  ws.send(JSON.stringify({ type: "subscriptions.set", requestID: "r1", chatIDs: ["*"] }));
});

ws.on("message", async (data) => {
  let json;
  try {
    json = JSON.parse(data.toString());
  } catch {
    console.log("(raw):", data.toString());
    return;
  }

  // console.log
  console.log(JSON.stringify(json, null, 2));
  console.log("---");

  // zapis do MongoDB
  try {
    const doc = { ...json, _receivedAt: new Date() };
    const result = await events.insertOne(doc);
    console.log(`[mongo] zapisano: ${result.insertedId} (type=${json.type})\n`);
  } catch (err) {
    console.error("[mongo] błąd zapisu:", err.message);
  }
});

ws.on("error", (err) => {
  console.error("Błąd WebSocket:", err.message);
});

ws.on("close", async (code, reason) => {
  console.log(`Połączenie zamknięte. Kod: ${code}, powód: ${reason.toString()}`);
  await mongoClient.close();
});

// Przy Ctrl+C – zamknij połączenia porządnie
process.on("SIGINT", async () => {
  console.log("\nZamykam...");
  ws.close();
  await mongoClient.close();
  process.exit(0);
});
