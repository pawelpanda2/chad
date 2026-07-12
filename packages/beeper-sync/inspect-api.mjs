import dotenv from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../.env.mac-beeper") });

const TOKEN = process.env.BEEPER_API_KEY;
if (!TOKEN) {
  console.error("No BEEPER_API_KEY found");
  process.exit(1);
}

const chatID = "!0091Tiyxo8zIWWkK4VrQ:beeper.local"; // Michał Grochowski Signal chat
const url = `http://localhost:23373/v1/chats/${encodeURIComponent(chatID)}/messages?limit=10`;

console.log("Fetching from:", url);
const res = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}` }
});

if (!res.ok) {
  console.error("HTTP error:", res.status, await res.text());
  process.exit(1);
}

const data = await res.json();
console.log("API response items:");
for (const item of data.items ?? []) {
  console.log(JSON.stringify(item, null, 2));
  console.log("---");
}
