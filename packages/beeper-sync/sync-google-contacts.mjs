/**
 * sync-google-contacts.mjs
 *
 * Importuje kontakty z Google Contacts (People API) do MongoDB.
 * Dopasowuje po nazwie do istniejących kontaktów Beeper i uzupełnia:
 *   - phones[]     — numery telefonów
 *   - avatarURL    — zdjęcie profilowe (jeśli brak)
 *   - googleContactId — ID Google Contact do późniejszego linkowania
 *
 * Pierwsze uruchomienie (autoryzacja):
 *   node sync-google-contacts.mjs --auth
 *
 * Regularne użycie:
 *   node sync-google-contacts.mjs
 *   node sync-google-contacts.mjs --dry    (podgląd bez zapisu)
 *
 * Setup:
 *   1. Utwórz projekt w Google Cloud Console
 *   2. Włącz "People API"
 *   3. Utwórz OAuth 2.0 credentials (Desktop App)
 *   4. Dodaj do .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

import dotenv    from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createServer }     from 'http';
import { homedir }          from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../../.env.mac-beeper') });

const DRY  = process.argv.includes('--dry');
const AUTH = process.argv.includes('--auth');

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const TOKENS_FILE   = resolve(homedir(), '.config/beeper-contacts/google-tokens.json');
const REDIRECT_URI  = 'http://localhost:4242/oauth/callback';
const SCOPE         = 'https://www.googleapis.com/auth/contacts.readonly';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
❌ Brak GOOGLE_CLIENT_ID lub GOOGLE_CLIENT_SECRET w .env

Kroki konfiguracji:
  1. Otwórz https://console.cloud.google.com/apis/credentials
  2. Utwórz projekt (lub użyj istniejącego)
  3. Włącz "People API": https://console.cloud.google.com/apis/library/people.googleapis.com
  4. Utwórz credentials → OAuth client ID → Desktop App
  5. Dodaj do .env:
       GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
       GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
  6. Uruchom: node sync-google-contacts.mjs --auth
`);
  process.exit(1);
}

// ── OAuth helpers ─────────────────────────────────────────────────────────────

function loadTokens() {
  if (existsSync(TOKENS_FILE)) {
    try { return JSON.parse(readFileSync(TOKENS_FILE, 'utf8')); } catch {}
  }
  return null;
}

function saveTokens(tokens) {
  const { mkdirSync } = require('fs');  // can't use require in ESM, handled below
  const dir = resolve(homedir(), '.config/beeper-contacts');
  import('fs').then(({ mkdirSync }) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  });
}

async function exchangeCode(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
      code,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return res.json();
}

/** Uruchamia lokalny serwer HTTP i czeka na callback OAuth z kodem. */
async function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:4242');
      const code = url.searchParams.get('code');
      if (code) {
        res.end('<html><body><h2>✅ Autoryzacja zakończona! Możesz zamknąć tę kartę.</h2></body></html>');
        server.close();
        resolve(code);
      } else {
        res.end('<html><body><h2>❌ Brak kodu. Spróbuj jeszcze raz.</h2></body></html>');
      }
    });
    server.listen(4242, () => resolve);
    server.on('error', reject);
    // Timeout po 5 minutach
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout')); }, 5 * 60 * 1000);
  });
}

async function authorize() {
  const authURL = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authURL.searchParams.set('client_id',     CLIENT_ID);
  authURL.searchParams.set('redirect_uri',  REDIRECT_URI);
  authURL.searchParams.set('response_type', 'code');
  authURL.searchParams.set('scope',         SCOPE);
  authURL.searchParams.set('access_type',   'offline');
  authURL.searchParams.set('prompt',        'consent');

  console.log('\n🔒 Otwórz poniższy URL w przeglądarce:\n');
  console.log(authURL.toString());
  console.log('\n⏳ Czekam na autoryzację (lokalny serwer na :4242)...\n');

  // Spróbuj otworzyć automatycznie
  const { exec } = await import('child_process');
  exec(`open "${authURL.toString()}"`);

  const server = createServer((req, res) => {});
  const code = await new Promise((resolve, reject) => {
    const s = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:4242');
      const code = url.searchParams.get('code');
      if (code) {
        res.end('<html><body style="font-family:sans-serif;padding:2rem"><h2>✅ Autoryzacja zakończona!</h2><p>Możesz zamknąć tę kartę i wrócić do terminala.</p></body></html>');
        s.close();
        resolve(code);
      } else {
        res.end('<p>Brak kodu.</p>');
      }
    });
    s.listen(4242, () => console.log('Serwer OAuth nasłuchuje na http://localhost:4242'));
    s.on('error', reject);
    setTimeout(() => { s.close(); reject(new Error('Timeout po 5 minutach')); }, 5 * 60 * 1000);
  });

  const tokens = await exchangeCode(code);
  // Zapisz tokeny
  const { mkdirSync } = await import('fs');
  const dir = resolve(homedir(), '.config/beeper-contacts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify({ ...tokens, obtained_at: Date.now() }, null, 2));
  console.log(`\n✅ Tokeny zapisane do: ${TOKENS_FILE}`);
  console.log('👉 Teraz uruchom: node sync-google-contacts.mjs\n');
  return tokens;
}

async function getAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Brak tokenów. Uruchom najpierw: node sync-google-contacts.mjs --auth');
  }
  // Jeśli token wygasł lub wygasa za < 60s — odświeź
  const expiresAt = (tokens.obtained_at || 0) + (tokens.expires_in || 3600) * 1000;
  if (Date.now() > expiresAt - 60_000) {
    console.log('[google] Odświeżam access token...');
    const fresh = await refreshAccessToken(tokens.refresh_token);
    const updated = { ...tokens, ...fresh, obtained_at: Date.now() };
    const { mkdirSync } = await import('fs');
    mkdirSync(resolve(homedir(), '.config/beeper-contacts'), { recursive: true });
    writeFileSync(TOKENS_FILE, JSON.stringify(updated, null, 2));
    return updated.access_token;
  }
  return tokens.access_token;
}

// ── Google People API ─────────────────────────────────────────────────────────

async function fetchAllGoogleContacts(accessToken) {
  const contacts = [];
  let pageToken = null;
  let page = 0;

  do {
    page++;
    const url = new URL('https://people.googleapis.com/v1/people/me/connections');
    url.searchParams.set('personFields', 'names,phoneNumbers,photos,emailAddresses,metadata');
    url.searchParams.set('pageSize', '1000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`People API error: ${await res.text()}`);
    const data = await res.json();

    for (const person of (data.connections ?? [])) {
      const resourceName = person.resourceName;
      const name  = person.names?.[0]?.displayName ?? '';
      const given = person.names?.[0]?.givenName   ?? '';
      const family= person.names?.[0]?.familyName  ?? '';
      const phones = (person.phoneNumbers ?? []).map(p => ({
        number: p.canonicalForm || p.value,
        label:  p.type || p.formattedType || 'mobile',
      })).filter(p => p.number);

      const photoURL = person.photos?.find(p => !p.metadata?.primary === false)?.url
                    ?? person.photos?.[0]?.url
                    ?? null;

      // Google nie udostępnia fotek z zewnętrznych kontaktów domyślnie — sprawdź czy to nie placeholder
      const isDefaultPhoto = photoURL?.includes('s100') || person.photos?.[0]?.metadata?.source?.type === 'CONTACT';

      contacts.push({ resourceName, name, given, family, phones, photoURL: isDefaultPhoto ? photoURL : null });
    }

    pageToken = data.nextPageToken ?? null;
    process.stdout.write(`\r[google] Pobrano ${contacts.length} kontaktów (strona ${page})...`);
  } while (pageToken);

  console.log('');
  return contacts;
}

// ── Name matching ─────────────────────────────────────────────────────────────

/** Normalizuje nazwę: zamiana polskich znaków, lowercase, trim */
function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Liczy podobieństwo Dice coefficient między dwoma stringami */
function diceSimilarity(a, b) {
  const bigrams = (s) => {
    const bg = new Set();
    for (let i = 0; i < s.length - 1; i++) bg.add(s[i] + s[i+1]);
    return bg;
  };
  const ba = bigrams(a), bb = bigrams(b);
  const intersection = [...ba].filter(x => bb.has(x)).length;
  return (2 * intersection) / (ba.size + bb.size);
}

/**
 * Dopasowuje kontakty Google do kontaktów MongoDB.
 *
 * Progi:
 *   score = 1.0 (po normalizacji identyczna nazwa)  → AUTO APPLY
 *   score 0.70-0.99                                 → SUGGESTION (do przeglądu w UI)
 *   score < 0.70                                    → ignoruj
 *
 * Dodatkowe heurystyki żeby unikać fałszywych:
 *   - Krótkie nazwy (≤4 znaki) wymagają dokładnego dopasowania (score = 1.0)
 *   - Jeden wyraz vs jeden wyraz: bardziej rygorystyczny próg (0.95)
 *   - Sugestie nie powstają jeśli nie ma nic do zaoferowania (brak tel i zdjęcia)
 */
function matchContacts(googleContacts, mongoContacts) {
  const certain    = []; // auto-apply
  const uncertain  = []; // suggestions

  for (const gc of googleContacts) {
    if (!gc.name) continue;
    // Pomijaj jeśli Google nie ma nic do zaoferowania
    if (!gc.phones.length && !gc.photoURL) continue;

    const gcNorm   = normalizeName(gc.name);
    const gcWords  = gcNorm.split(' ').length;

    let bestScore = 0;
    let bestMongo = null;

    for (const mc of mongoContacts) {
      if (!mc.displayName) continue;
      const mcNorm = normalizeName(mc.displayName);
      const score  = diceSimilarity(gcNorm, mcNorm);
      if (score > bestScore) { bestScore = score; bestMongo = mc; }
    }

    if (!bestMongo) continue;

    // Heurystyki dolnego progu
    const minWords    = Math.min(gcWords, normalizeName(bestMongo.displayName ?? '').split(' ').length);
    const nameLen     = Math.min(gcNorm.length, normalizeName(bestMongo.displayName ?? '').length);
    const isShortName = nameLen <= 4;
    const isSingleWord = minWords === 1;

    // Próg minimalny do wyświetlania jako sugestia
    const suggestionThreshold = isShortName ? 1.0 : isSingleWord ? 0.90 : 0.72;
    // Próg auto-apply: zawsze tylko dokładne dopasowanie
    const autoApplyThreshold  = 1.0;

    if (bestScore >= autoApplyThreshold) {
      certain.push({ gc, mc: bestMongo, score: bestScore });
    } else if (bestScore >= suggestionThreshold) {
      uncertain.push({ gc, mc: bestMongo, score: bestScore });
    }
  }

  return {
    certain:   certain.sort((a, b) => b.score - a.score),
    uncertain: uncertain.sort((a, b) => b.score - a.score),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

if (AUTH) {
  await authorize();
  process.exit(0);
}

// Połącz z MongoDB
import { MongoClient, ObjectId } from 'mongodb';

const mongoClient = new MongoClient(process.env.MONGODB_URI);
await mongoClient.connect();
const db = mongoClient.db();
const contactsCol      = db.collection('contacts');
const suggestionsCol   = db.collection('merge_suggestions');

console.log(`
╔══════════════════════════════════════════════════════════╗
║        Google Contacts Sync                              ║
╚══════════════════════════════════════════════════════════╝
Tryb: ${DRY ? 'DRY RUN (bez zapisu)' : 'LIVE'}
`);

// Pobierz access token
const accessToken = await getAccessToken();

// Pobierz kontakty z Google
console.log('[google] Pobieram kontakty z Google...');
const googleContacts = await fetchAllGoogleContacts(accessToken);
console.log(`[google] Znaleziono ${googleContacts.length} kontaktów Google\n`);

// Pobierz kontakty z MongoDB (aktywne)
const mongoContacts = await contactsCol
  .find({ mergedInto: { $exists: false } })
  .project({ _id: 1, displayName: 1, avatarURL: 1, phones: 1, googleContactId: 1 })
  .toArray();
console.log(`[mongo]  Aktywnych kontaktów w bazie: ${mongoContacts.length}\n`);

// Dopasuj
const { certain, uncertain } = matchContacts(googleContacts, mongoContacts);

// ── Raport ────────────────────────────────────────────────────────────────────
console.log(`=== AUTO-APPLY (score = 1.0, identyczna nazwa): ${certain.length} ===`);
for (const m of certain) {
  console.log(`  [${m.score.toFixed(2)}] "${m.gc.name}" → "${m.mc.displayName}" ${m.gc.phones.length ? '📞' : ''}${m.gc.photoURL ? '📸' : ''}`);
  if (m.gc.phones.length) console.log(`         ☎ ${m.gc.phones.map(p => p.number).join(', ')}`);
}

console.log(`\n=== SUGESTIE (wymagają przeglądu w UI): ${uncertain.length} ===`);
for (const m of uncertain) {
  const pct = (m.score * 100).toFixed(0);
  console.log(`  [${pct}%] "${m.gc.name}" ≈ "${m.mc.displayName}" ${m.gc.phones.length ? '📞' : ''}${m.gc.photoURL ? '📸' : ''}`);
  if (m.gc.phones.length) console.log(`         ☎ ${m.gc.phones.map(p => p.number).join(', ')}`);
}

if (!DRY) {
  console.log('\n[sync] Zapisuję do MongoDB...');
  let applied    = 0;
  let savedSuggs = 0;

  // Auto-apply: dokładne dopasowania
  for (const { gc, mc } of certain) {
    const upd = {};

    const existingNums = new Set((mc.phones ?? []).map(p => p.number));
    const newPhones    = gc.phones.filter(p => !existingNums.has(p.number));
    if (newPhones.length) upd.$push = { phones: { $each: newPhones } };

    if (gc.photoURL && !mc.avatarURL) {
      upd.$set = { ...(upd.$set ?? {}), avatarURL: gc.photoURL };
    }
    if (!mc.googleContactId && gc.resourceName) {
      upd.$set = { ...(upd.$set ?? {}), googleContactId: gc.resourceName };
    }

    if (Object.keys(upd).length) {
      upd.$set = { ...(upd.$set ?? {}), updatedAt: new Date() };
      await contactsCol.updateOne({ _id: mc._id }, upd);
      applied++;
    }
  }

  // Zapisz sugestie do bazy (upsert żeby nie duplikować przy ponownym uruchomieniu)
  for (const { gc, mc, score } of uncertain) {
    await suggestionsCol.updateOne(
      {
        type:      'google_enrich',
        contactId: mc._id,
        'googleContact.resourceName': gc.resourceName,
      },
      {
        $set: {
          type:          'google_enrich',
          contactId:     mc._id,
          score,
          googleContact: {
            resourceName: gc.resourceName,
            name:         gc.name,
            phones:       gc.phones,
            photoURL:     gc.photoURL,
          },
          updatedAt: new Date(),
        },
        $setOnInsert: {
          status:    'pending',
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    savedSuggs++;
  }

  console.log(`
✅ Auto-zastosowano:  ${applied} kontaktów
📋 Sugestii zapisano: ${savedSuggs} (przejrzyj w dashboardzie)
`);
} else {
  console.log(`\n[DRY RUN] Nie zapisano zmian.`);
  console.log(`  Auto-apply:  ${certain.length}`);
  console.log(`  Sugestie:    ${uncertain.length}`);
}

await mongoClient.close();
process.exit(0);
