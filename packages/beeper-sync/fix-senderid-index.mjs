import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { resolveOwnerRepoGuid, ownerDatabaseName } from './lib/owner-db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.mac-beeper') });

const repoGuid = resolveOwnerRepoGuid();
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));
const col = db.collection('contacts');

// Ile kontaktów ma senderID: null w identities
const withNull = await col.countDocuments({ 'identities.senderID': null });
console.log(`Kontakty z null senderID: ${withNull}`);

const indexes = await col.indexes();
for (const idx of indexes) {
  if (JSON.stringify(idx.key).includes('senderID')) {
    console.log(`Indeks: ${idx.name} | unique: ${idx.unique ?? false} | partial: ${JSON.stringify(idx.partialFilterExpression ?? {})}`);
  }
}

// Usuń stary indeks
for (const name of ['identities_senderID_unique', 'identities.senderID_1']) {
  try { await col.dropIndex(name); console.log(`Usunięto: ${name}`); }
  catch (e) { console.log(`Nie ma: ${name}`); }
}

// Utwórz nowy z partialFilterExpression — ignoruje null i brak pola
await col.createIndex(
  { 'identities.senderID': 1 },
  {
    unique: true,
    partialFilterExpression: { 'identities.senderID': { $type: 'string' } },
    name: 'identities_senderID_unique',
  }
);
console.log('\n✅ Nowy indeks (partialFilter: string only, ignoruje null) utworzony');

await client.close();
