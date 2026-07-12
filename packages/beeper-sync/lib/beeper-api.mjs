/**
 * beeper-api.mjs — Klient REST API Beepera (localhost:23373)
 * z wbudowanym rate-limitingiem między chatami i obsługą błędów.
 */

const BASE_URL = "http://localhost:23373";
const DELAY_BETWEEN_CHATS_MS = 100; // ms przerwy między chatami
const PAGE_SIZE = 100;

let token = null;

export function setToken(t) {
  token = t;
}

async function apiFetch(path) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Pobiera listę wszystkich chatów widocznych w Beeper (inbox).
 * Uwaga: paginacja przez cursor jest niefunkcjonalna po stronie API —
 * zwraca stały zestaw ~25 chatów. Pobieramy je jednorazowo.
 */
export async function fetchAllChats() {
  const data = await apiFetch(`/v1/chats?limit=200`);
  return data.items ?? [];
}

/**
 * Pobiera szczegółowe metadane jednego chatu (type, title, participants, preview).
 */
export async function fetchChat(chatID) {
  try {
    return await apiFetch(`/v1/chats/${encodeURIComponent(chatID)}`);
  } catch (err) {
    if (err.message.includes("404") || err.message.includes("not_found")) return null;
    throw err;
  }
}

/**
 * Pobiera jedną stronę wiadomości dla chatu (od najnowszej).
 * @param {string} chatID
 * @param {string|null} startKey — sortKey ostatniej wiadomości z poprzedniej strony
 */
export async function fetchMessagesPage(chatID, startKey = null) {
  const qs = `limit=${PAGE_SIZE}` + (startKey ? `&startKey=${encodeURIComponent(startKey)}` : "");
  const data = await apiFetch(`/v1/chats/${encodeURIComponent(chatID)}/messages?${qs}`);
  return {
    items: data.items ?? [],
    hasMore: data.hasMore ?? false,
  };
}

/**
 * Generator: iteruje przez WSZYSTKIE strony wiadomości chatu (od najnowszej do najstarszej).
 * Zatrzymuje się gdy hasMore = false lub items jest puste.
 */
export async function* fetchAllMessages(chatID, startFromSortKey = null) {
  let cursor = startFromSortKey;
  let pageNum = 0;

  while (true) {
    pageNum++;
    const { items, hasMore } = await fetchMessagesPage(chatID, cursor);

    if (items.length === 0) break;

    yield { items, pageNum };

    if (!hasMore) break;

    // Cursor do następnej strony = sortKey ostatniego (najstarszego w tej porcji) elementu
    const last = items[items.length - 1];
    const nextCursor = last.sortKey;

    // Zabezpieczenie przed pętlą nieskończoną: cursor nie może być taki sam
    if (nextCursor === cursor) {
      console.warn(`[api] Cursor nie zmienił się (${cursor}) — zatrzymuję paginację dla ${chatID}`);
      break;
    }

    cursor = nextCursor;
  }
}

export const DELAY_MS = DELAY_BETWEEN_CHATS_MS;

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
