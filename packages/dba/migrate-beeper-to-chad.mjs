import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI not set");

const client = new MongoClient(uri);
await client.connect();

const source = client.db("beeper").collection("items");
const dest = client.db("chad").collection("cp_items");

const docs = await source.find({}).toArray();
console.log(`source beeper.items: ${docs.length} documents`);

let written = 0;
for (const doc of docs) {
  await dest.updateOne(
    { _id: doc._id },
    { $set: { config: doc.config, body: doc.body } },
    { upsert: true }
  );
  written++;
}
console.log(`chad.cp_items after: ${await dest.countDocuments({})} documents (wrote ${written})`);

await dest.createIndex({ "config.address": 1 }, { unique: true, name: "config_address_unique" });
console.log("index created");

await client.close();
