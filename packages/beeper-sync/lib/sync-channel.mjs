/**
 * sync-channel.mjs — Synchronizacja wiadomości jednego kanału z Beeper API.
 */

import {
  fetchAllMessages,
  fetchChat,
} from "./beeper-api.mjs";

import {
  channelsCol,
  upsertChannel,
  upsertContact,
  addParticipant,
  upsertMessage,
  upsertReaction,
  getSyncState,
  setSyncState,
  MY_SENDER_ID,
} from "./db.mjs";

/**
 * Synchronizuje cały kanał: metadane + wiadomości + kontakty.
 *
 * @param {string} beeperChatID — np. "!HFmLdvJfi5oCghOA82iR:beeper.local"
 * @param {object} options
 * @param {boolean} options.force — ignoruj stan synchronizacji, zacznij od nowa
 */
export async function syncChannel(beeperChatID, options = {}) {
  const { force = false } = options;

  // 1. Pobierz metadane kanału z REST API
  const chatInfo = await fetchChat(beeperChatID);
  if (!chatInfo) {
    console.log(`[sync] Kanał ${beeperChatID} niedostępny w API — pomijam`);
    return { skipped: true };
  }

  const network = chatInfo.accountID;
  const channelID = await upsertChannel(beeperChatID, network, {
    type:  chatInfo.type  ?? "direct",
    title: chatInfo.title ?? null,
    lastMessageAt: chatInfo.lastActivity ? new Date(chatInfo.lastActivity) : null,
  });

  // 2. Sprawdź stan synchronizacji (chyba że force)
  const state = force ? null : await getSyncState(beeperChatID);
  const resumeCursor = state?.oldestSyncedSortKey ?? null;

  // Jeśli mamy pełny sync (fully_synced) i nie wymuszamy — skip
  if (state?.status === "fully_synced" && !force) {
    console.log(`[sync] ${beeperChatID} — już zsynchronizowany, pomijam`);
    return { skipped: true };
  }

  console.log(`\n[sync] Zaczynam: ${beeperChatID}`);
  if (chatInfo.title) console.log(`       Tytuł: ${chatInfo.title}`);
  console.log(`       Typ: ${chatInfo.type} | Sieć: ${network}`);
  if (resumeCursor) console.log(`       Wznawianie od sortKey: ${resumeCursor}`);

  let totalInserted  = 0;
  let totalUpdated   = 0;
  let totalReactions = 0;
  let oldestSortKey  = resumeCursor;

  // 3. Paginuj wiadomości od najnowszej do najstarszej
  for await (const { items, pageNum } of fetchAllMessages(beeperChatID, resumeCursor)) {
    process.stdout.write(`\r       Strona ${pageNum}: ${items.length} wiad. ...`);

    for (const entry of items) {
      const {
        id: beeperMessageID,
        senderID,
        senderName,
        timestamp,
        type,
        text,
        reactions = [],
        linkedMessageID,
        isSender,
        isUnread = false,
        sortKey,
      } = entry;

      const isSelf = isSender || senderID === MY_SENDER_ID;
      const ts = timestamp ? new Date(timestamp) : new Date();

      // Śledzenie najstarszego sortKey
      if (!oldestSortKey || Number(sortKey) < Number(oldestSortKey)) {
        oldestSortKey = sortKey;
      }

      // ── Reakcja ─────────────────────────────────────────────────────────
      if (type === "REACTION" && linkedMessageID) {
        const emoji = entry.reactionKey ?? entry.emoji ?? "👍";
        await upsertReaction(channelID, linkedMessageID, network, senderID, emoji);
        totalReactions++;
        continue;
      }

      // Ignoruj wiadomości usunięte, ukryte lub puste wiadomości tekstowe bez załączników
      const isDeletedOrHidden = entry.isDeleted || entry.isHidden;
      const isEmptyText = (type === "TEXT" || !type) && !text && (!entry.attachments || entry.attachments.length === 0);
      if (isDeletedOrHidden || isEmptyText) {
        continue;
      }

      // ── Kontakt (tylko jeśli to nie my) ─────────────────────────────────
      let contactID = null;
      if (!isSelf && senderID) {
        contactID = await upsertContact(senderID, senderName, network);
        await addParticipant(channelID, contactID);
      }

      // ── Mapuj reakcje z pola reactions[] ────────────────────────────────
      const mappedReactions = reactions
        .map(r => ({
          senderID: r.participantID ?? r.id,
          emoji:    r.reactionKey   ?? r.emoji ?? "",
        }))
        .filter(r => r.emoji);

      // ── Upsert wiadomości ────────────────────────────────────────────────
      const { inserted } = await upsertMessage({
        beeperMessageID: beeperMessageID ?? null,
        channelID,
        contactID,
        isSelf,
        network,
        type:    type   ?? "TEXT",
        text:    text   ?? "",
        reactions: mappedReactions,
        timestamp: ts,
        isUnread,
        deletedAt: null,
      });

      if (inserted) totalInserted++; else totalUpdated++;
    }

    // Zapisz postęp po każdej stronie (checkpoint)
    await setSyncState(beeperChatID, {
      status: "in_progress",
      oldestSyncedSortKey: oldestSortKey,
      lastPageNum: pageNum,
    });
  }

  // 4. Oznacz jako ukończony
  await setSyncState(beeperChatID, {
    status: "fully_synced",
    oldestSyncedSortKey: oldestSortKey,
    syncedAt: new Date(),
  });

  console.log(
    `\n[sync] ✓ ${beeperChatID}: +${totalInserted} nowych, ~${totalUpdated} zaktualizowanych, ${totalReactions} reakcji`
  );

  return { totalInserted, totalUpdated, totalReactions };
}
