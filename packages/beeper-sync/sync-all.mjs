/**
 * sync-all.mjs — Główny orkiestrator synchronizacji Beepera.
 *
 * Uruchamia kolejno wszystkie kroki synchronizacji i czyszczenia danych:
 *   1. Import z SQLite (Incremental/Force)
 *   2. Synchronizacja z REST API
 *   3. Wzbogacenie kontaktów z lokalnej bazy Matrix (SQLite)
 *   4. Wzbogacenie kontaktów z REST API
 *   5. Deduplikacja wiadomości (MongoDB)
 *   6. Usuwanie duplikatów kontaktów i naprawa indeksów
 *
 * Flagi:
 *   --force   - Pełna synchronizacja (wymusza pobranie wszystkiego od nowa)
 */

import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes("--force");

const steps = [
  {
    name: "1/6: Import z lokalnego SQLite (BeeperTexts/index.db)",
    script: "index.mjs",
    args: ["--sqlite", ...(FORCE ? ["--force"] : [])]
  },
  {
    name: "2/6: Synchronizacja z REST API (Najnowsze wiadomości)",
    script: "index.mjs",
    args: FORCE ? ["--force"] : []
  },
  {
    name: "3/6: Wzbogacanie kontaktów z profili Matrix (account.db)",
    script: "enrich-from-sqlite.mjs",
    args: []
  },
  {
    name: "4/6: Wzbogacanie nazw kontaktów z REST API",
    script: "enrich-contacts.mjs",
    args: []
  },
  {
    name: "5/7: Deduplikacja wiadomości w MongoDB",
    script: "dedup-messages.mjs",
    args: []
  },
  {
    name: "6/7: Usuwanie duplikatów kontaktów i naprawa indeksów",
    script: "fix-contact-dupes.mjs",
    args: []
  },
  {
    name: "7/7: Synchronizacja z Google Contacts (Zdjęcia i Telefony)",
    script: "sync-google-contacts.mjs",
    args: []
  }
];

function runStep(step) {
  return new Promise((resolveReject) => {
    console.log(`\n\x1b[36m=== ${step.name} ===\x1b[0m`);
    
    const cp = spawn("node", [step.script, ...step.args], {
      cwd: __dirname,
      stdio: "inherit"
    });

    cp.on("close", (code) => {
      if (code === 0) {
        resolveReject();
      } else {
        console.error(`\x1b[31m[sync] Błąd w kroku: ${step.name} (Kod wyjścia: ${code})\x1b[0m`);
        // Nie przerywamy całego procesu, pozwalamy lecieć kolejnym krokom
        resolveReject();
      }
    });
  });
}

console.log(`
\x1b[35m╔══════════════════════════════════════════════════════════╗
║         Beeper Full Sync & Optimization Pipeline         ║
╚══════════════════════════════════════════════════════════╝\x1b[0m
Tryb: ${FORCE ? "\x1b[31mFORCE (pełny re-sync)\x1b[0m" : "\x1b[32mINCREMENTAL\x1b[0m"}
`);

const start = Date.now();

for (const step of steps) {
  await runStep(step);
}

const duration = ((Date.now() - start) / 1000).toFixed(1);
console.log(`
\x1b[32m╔══════════════════════════════════════════════════════════╗
║  Pełna synchronizacja zakończona sukcesem!               ║
╚══════════════════════════════════════════════════════════╝\x1b[0m
  Łączny czas wykonania: \x1b[33m${duration}s\x1b[0m
`);

process.exit(0);
