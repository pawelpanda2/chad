/**
 * fix-contact-dupes.mjs
 *
 * Problem: race condition w upsertContact — find + insert nie jest atomowe.
 * Efekt: ten sam senderID ma wiele dokumentów w kolekcji contacts.
 *
 * Strategia naprawy:
 *   1. Znajdź wszystkie senderID które mają >1 kontakt
 *   2. Dla każdego zestawu duplikatów wybierz "primary" (który ma lepsze dane: more identities / displayName != senderID)
 *   3. Przenieś z duplikatów do primary: messages.contactID, channels.participantIDs
 *   4. Usuń duplikaty (hard delete — to nie zmergowane przez użytkownika, to techniczne śmieci)
 *   5. Dodaj unikalny index na identities.senderID żeby to się nie powtórzyło
 */

import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MongoClient, ObjectId } from 'mongodb';
import { resolveOwnerRepoGuid, ownerDatabaseName } from './lib/owner-db.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.mac-beeper') });

const repoGuid = resolveOwnerRepoGuid();
const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(ownerDatabaseName(repoGuid));
const contacts   = db.collection('contacts');
const messages   = db.collection('messages');
const channels   = db.collection('channels');

const DRY_RUN = process.argv.includes('--dry');
if (DRY_RUN) console.log('⚠️  DRY RUN — żadne zmiany nie zostaną zapisane\n');

// ── 1. Znajdź wszystkie duplikaty ────────────────────────────────────────────
const pipeline = [
  { $unwind: '$identities' },
  {
    $group: {
      _id: '$identities.senderID',
      count: { $sum: 1 },
      docs: { $push: {
        id:          '$_id',
        displayName: '$displayName',
        notes:       '$notes',
        bio:         '$bio',
        tags:        '$tags',
        avatarURL:   '$avatarURL',
        socialLinks: '$socialLinks',
        mergedFrom:  '$mergedFrom',
        identities:  '$identities',
        createdAt:   '$createdAt',
      }}
    }
  },
  { $match: { count: { $gt: 1 } } },
  { $sort: { count: -1 } },
];

const dupeGroups = await contacts.aggregate(pipeline).toArray();
console.log(`=== Znaleziono ${dupeGroups.length} senderID z duplikatami ===\n`);

let totalDeleted = 0;
let totalMoved   = 0;

for (const group of dupeGroups) {
  const senderID = group._id;
  const docs = group.docs;

  // Wybierz primary: preferuj ten który ma:
  // 1. displayName != senderID (czyli ma prawdziwą nazwę)
  // 2. Ma więcej danych (notes, bio, tags, avatar)
  // 3. Najstarszy createdAt (był pierwszy)
  function score(doc) {
    let s = 0;
    if (doc.displayName && doc.displayName !== senderID) s += 10;
    if (doc.notes)       s += 5;
    if (doc.bio)         s += 5;
    if (doc.avatarURL)   s += 3;
    if (doc.tags?.length)   s += doc.tags.length;
    if (doc.socialLinks?.length) s += 2;
    // starszy = niższy timestamp = lepszy (był priorytetowy)
    if (doc.createdAt) s -= Math.floor(new Date(doc.createdAt).getTime() / 1e9);
    return s;
  }

  docs.sort((a, b) => score(b) - score(a));
  const primary   = docs[0];
  const duplicates = docs.slice(1);

  console.log(`senderID: ${senderID} (${docs.length}x)`);
  console.log(`  Primary: ${primary.id} "${primary.displayName}"`);
  console.log(`  Duplikaty do usunięcia: ${duplicates.map(d => d.id).join(', ')}`);

  const dupeIDs = duplicates.map(d => new ObjectId(d.id));
  const primaryID = new ObjectId(primary.id);

  if (!DRY_RUN) {
    // Przenieś messages.contactID
    const msgResult = await messages.updateMany(
      { contactID: { $in: dupeIDs } },
      { $set: { contactID: primaryID } }
    );
    totalMoved += msgResult.modifiedCount;
    if (msgResult.modifiedCount > 0) {
      console.log(`  → Przeniesiono ${msgResult.modifiedCount} wiadomości`);
    }

    // Przenieś channels.participantIDs
    // Dla każdego kanału który ma duplikat w participantIDs: usuń duplikat, dodaj primary
    for (const dupeID of dupeIDs) {
      await channels.updateMany(
        { participantIDs: dupeID },
        { $addToSet: { participantIDs: primaryID } }
      );
      await channels.updateMany(
        { participantIDs: dupeID },
        { $pull: { participantIDs: dupeID } }
      );
    }

    // Usuń duplikaty (hard delete — to nie user-merge, to techniczne śmieci)
    const delResult = await contacts.deleteMany({ _id: { $in: dupeIDs } });
    totalDeleted += delResult.deletedCount;
    console.log(`  → Usunięto ${delResult.deletedCount} duplikatów`);
  }

  console.log('');
}

if (!DRY_RUN) {
  // ── 2. Dodaj unikalny sparse partial index na senderID ─────────────────────
  // Sparse bo nie każdy kontakt ma identities (choć powinien)
  // Partial bo identities to tablica — indeksujemy multikey
  try {
    await contacts.createIndex(
      { 'identities.senderID': 1 },
      {
        unique: true,
        partialFilterExpression: { 'identities.senderID': { $type: 'string' } },
        name: 'identities_senderID_unique',
      }
    );
    console.log('✅ Unikalny index na identities.senderID (ignoruje null) utworzony');
  } catch (e) {
    if (e.code === 85 || e.code === 86) {
      // Index already exists — drop old one and recreate
      await contacts.dropIndex('identities_senderID_unique').catch(() => {});
      await contacts.createIndex(
        { 'identities.senderID': 1 },
        { unique: true, name: 'identities_senderID_unique' }
      );
      console.log('✅ Unikalny index na identities.senderID zaktualizowany');
    } else {
      console.error('❌ Błąd tworzenia indexu:', e.message);
    }
  }

  console.log(`\n=== Podsumowanie ===`);
  console.log(`Usuniętych duplikatów:        ${totalDeleted}`);
  console.log(`Przeniesionych wiadomości:    ${totalMoved}`);
} else {
  console.log(`\n[DRY RUN] Nie wykonano żadnych zmian.`);
  console.log(`Łączna liczba duplikatów do usunięcia: ${dupeGroups.reduce((s, g) => s + g.docs.length - 1, 0)}`);
}

await client.close();
