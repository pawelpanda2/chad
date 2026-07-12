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

const chats = [
  "!sqxf2d5VtItn99jw9gRb:beeper.local",
  "!MULDWjzC1hwXCqh0kg5J:beeper.local",
  "!JUWZ8jijJCRoizO3yBZc:beeper.local"
];

for (const chatID of chats) {
  const url = `http://localhost:23373/v1/chats/${encodeURIComponent(chatID)}/messages?limit=10`;
  console.log(`Fetching ${chatID} from Beeper REST API...`);
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    if (res.ok) {
      const data = await res.json();
      console.log(`Response for ${chatID}:`, JSON.stringify(data, null, 2));
    } else {
      console.log(`Failed to fetch ${chatID}:`, res.status, await res.text());
    }
  } catch (err) {
    console.error(`Error fetching ${chatID}:`, err.message);
  }
  console.log("-----------------------------------------");
}
