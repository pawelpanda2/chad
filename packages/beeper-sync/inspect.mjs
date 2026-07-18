import { MongoClient } from "mongodb";
import { resolveOwnerRepoGuid, ownerDatabaseName } from "./lib/owner-db.mjs";

const repoGuid = resolveOwnerRepoGuid();
const uri = process.env.MONGODB_URI || "mongodb://localhost:27017";
const client = new MongoClient(uri);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));
const channelsCol = db.collection("channels");

const channel = await channelsCol.findOne({ beeperChatID: "!MULDWjzC1hwXCqh0kg5J:beeper.local" });
console.log("Channel details:", channel);

await client.close();
