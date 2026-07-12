/**
 * diag-setup.mjs — Diagnostyka /v1/app/setup
 *
 * 1. Pobiera /v1/app/setup z tokenem z .env
 * 2. Wyświetla odpowiedź (w tym matrix.userID)
 * 3. Porównuje z MY_SENDER_ID z .env
 * 4. Jeśli niezgodne — wypisuje prawidłową wartość do wklejenia
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

const TOKEN     = process.env.BEEPER_API_KEY;
const MY_SENDER = process.env.MY_SENDER_ID;
const BASE_URL  = "http://localhost:23373";

if (!TOKEN) {
  console.error("Brak BEEPER_API_KEY w .env");
  process.exit(1);
}

console.log("═".repeat(60));
console.log("  Diagnostyka /v1/app/setup");
console.log("═".repeat(60));
console.log(`Token (pierwsze 12 znaków): ${TOKEN?.slice(0, 12)}…`);
console.log(`MY_SENDER_ID z .env:        ${MY_SENDER || "(brak)"}`);
console.log();

// --- curl / HTTP diagnostic ---
console.log(`GET ${BASE_URL}/v1/app/setup`);
console.log(`Header: Authorization: Bearer ${TOKEN?.slice(0, 12)}…`);
console.log();

const res = await fetch(`${BASE_URL}/v1/app/setup`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
  signal:  AbortSignal.timeout(15_000),
});

const text = await res.text();
console.log(`HTTP ${res.status} ${res.statusText}`);
console.log();

let data;
try {
  data = JSON.parse(text);
} catch {
  console.error("Odpowiedź nie jest JSON:");
  console.error(text.slice(0, 500));
  process.exit(1);
}

console.log("Odpowiedź JSON (wybrane pola):");
console.log("─".repeat(60));
console.log(`  matrix.userID:    ${data.matrix?.userID   ?? "(brak)"}`);
console.log(`  matrix.deviceID:  ${data.matrix?.deviceID ?? "(brak)"}`);
console.log(`  user.name:        ${data.user?.name       ?? "(brak)"}`);
console.log(`  user.email:       ${data.user?.email      ?? "(brak)"}`);
console.log("─".repeat(60));
console.log();

// --- porównanie z MY_SENDER_ID ---
const apiUserID = data.matrix?.userID;
if (!apiUserID) {
  console.error("Brak matrix.userID w odpowiedzi API");
  process.exit(1);
}

if (apiUserID === MY_SENDER) {
  console.log("✓ MY_SENDER_ID zgadza się z matrix.userID z API");
} else {
  console.log("✗ NIEZGODNOŚĆ!");
  console.log(`  MY_SENDER_ID z .env:  ${MY_SENDER}`);
  console.log(`  matrix.userID z API:  ${apiUserID}`);
  console.log();
  console.log("═".repeat(60));
  console.log("  PRAWIDŁOWA WARTOŚĆ DO .env:");
  console.log("═".repeat(60));
  console.log(`MY_SENDER_ID=${apiUserID}`);
  console.log("═".repeat(60));
}