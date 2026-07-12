import fs from 'fs';
import crypto from 'crypto';
import { messagesCol, closeDb, ObjectId } from './lib/db.mjs';

const channelIDStr = '69d0df66085da30bab1c018b';
const contactIDStr = '69ff3e8213d045b693fdb738';
const network = 'whatsapp';

const isDryRun = process.argv.includes('--dry-run');

async function main() {
  const filePath = '../../WhatsApp Chat with Natalia Kuchta.txt';
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n').map(l => l.replace(/\r$/, ''));

  if (isDryRun) {
    console.log('[DRY RUN] Uruchamianie w trybie dry-run. Baza nie zostanie zmodyfikowana.');
  }
  console.log(`Wczytano plik: ${filePath}`);

  const msgRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4}), (\d{1,2}:\d{2}\u202f?[AP]M) - (.*?): (.*)$/;

  let msgs = [];
  let currentMsg = null;

  for (const line of lines) {
    const match = line.match(msgRegex);
    if (match) {
      if (currentMsg) {
        msgs.push(currentMsg);
      }
      const [_, dateStr, timeStr, sender, content] = match;
      
      // Parse date
      const dateObj = new Date(`${dateStr} ${timeStr}`);
      
      currentMsg = {
        channelID: new ObjectId(channelIDStr),
        contactID: sender === 'Daniel Gustaw' ? null : new ObjectId(contactIDStr),
        isSelf: sender === 'Daniel Gustaw',
        network: network,
        type: 'TEXT',
        text: content,
        timestamp: dateObj,
        createdAt: new Date(),
        updatedAt: new Date(),
        // mock beeperMessageID to avoid undefined matching issues if we rerun
        beeperMessageID: `whatsapp-import-${crypto.randomUUID()}`,
      };
    } else {
      // it could be a system message (like "Messages and calls are end-to-end encrypted") or multiline
      if (currentMsg) {
        currentMsg.text += '\n' + line;
      }
    }
  }
  if (currentMsg) msgs.push(currentMsg);

  let inserted = 0;
  let updated = 0;
  
  for (const m of msgs) {
    const trimmed = (m.text || "").trim();
    if (trimmed === "" || trimmed === "<Media omitted>") continue;

    
    const timeWindow = 4 * 60 * 60 * 1000; // 4 hours
    const candidates = await messagesCol.find({
      channelID: m.channelID,
      isSelf: m.isSelf,
      timestamp: {
        $gte: new Date(m.timestamp.getTime() - timeWindow),
        $lte: new Date(m.timestamp.getTime() + timeWindow)
      }
    }).toArray();

    const existing = candidates.find(c => (c.text || "").trim() === (m.text || "").trim());

    if (!existing) {
      const logText = m.text ? (m.text.length > 50 ? m.text.substring(0, 50).replace(/\n/g, ' ') + '...' : m.text.replace(/\n/g, ' ')) : '[BRAK TEKSTU/ZAŁĄCZNIK]';
      console.log(`[NOWA] ${m.timestamp.toISOString()} | ${m.isSelf ? 'Ja' : 'Ona'}: ${logText}`);
      if (!isDryRun) {
        await messagesCol.insertOne(m);
      }
      inserted++;
    } else {
      // message already exists, we can skip it
      // console.log(`[POMINIĘTO] ${m.timestamp.toISOString()} | ${m.text.substring(0, 30)} - już istnieje.`);
    }
  }

  console.log(`Zakończono. Do dodania: ${inserted}, Do aktualizacji: ${updated}. Łącznie w pliku: ${msgs.length}`);
  await closeDb();
}

main().catch(console.error);
