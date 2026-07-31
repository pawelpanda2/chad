/**
 * Local IndexedDB checkpoint for in-progress recording sessions.
 *
 * While recording, every MediaRecorder chunk is appended here, so a page
 * refresh mid-session loses at most the last timeslice (~1s) — the main
 * refresh protection (beforeunload is only a secondary warning). After the
 * session's final upload reaches the backend the local copy is deleted.
 *
 * localStorage is never used for audio (binary + size limits). When
 * IndexedDB is unavailable (private mode, etc.) every function degrades to
 * a no-op and recording continues with backend-only protection.
 */

const DB_NAME = "chad-audio-recording-drafts";
const DB_VERSION = 1;
const CHUNKS_STORE = "chunks";
const SESSIONS_STORE = "sessions";

export interface PendingSessionMeta {
  /** `${draftId}:${sessionId}` */
  key: string;
  draftId: string;
  sessionId: string;
  mimeType: string;
  activeMs: number;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        const store = db.createObjectStore(CHUNKS_STORE, { autoIncrement: true });
        store.createIndex("bySession", "key", { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function sessionKey(draftId: string, sessionId: string): string {
  return `${draftId}:${sessionId}`;
}

export async function appendSessionChunk(
  draftId: string,
  sessionId: string,
  chunk: Blob,
  mimeType: string,
  activeMs: number,
): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([CHUNKS_STORE, SESSIONS_STORE], "readwrite");
    const key = sessionKey(draftId, sessionId);
    tx.objectStore(CHUNKS_STORE).add({ key, chunk });
    const meta: PendingSessionMeta = {
      key,
      draftId,
      sessionId,
      mimeType,
      activeMs,
      updatedAt: Date.now(),
    };
    tx.objectStore(SESSIONS_STORE).put(meta);
    await txDone(tx);
  } catch {
    // Checkpoint is best-effort; recording must not fail because of it.
  } finally {
    db.close();
  }
}

export async function listPendingSessions(): Promise<PendingSessionMeta[]> {
  const db = await openDb();
  if (!db) return [];
  try {
    const tx = db.transaction(SESSIONS_STORE, "readonly");
    const request = tx.objectStore(SESSIONS_STORE).getAll();
    const items = await new Promise<PendingSessionMeta[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result as PendingSessionMeta[]) ?? []);
      request.onerror = () => reject(request.error);
    });
    return items;
  } catch {
    return [];
  } finally {
    db.close();
  }
}

/** Rebuilds the session's audio as one Blob from the checkpointed chunks. */
export async function assembleSessionBlob(
  draftId: string,
  sessionId: string,
): Promise<{ blob: Blob; meta: PendingSessionMeta } | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const key = sessionKey(draftId, sessionId);
    const tx = db.transaction([CHUNKS_STORE, SESSIONS_STORE], "readonly");
    const metaRequest = tx.objectStore(SESSIONS_STORE).get(key);
    const chunksRequest = tx.objectStore(CHUNKS_STORE).index("bySession").getAll(key);
    const [meta, rows] = await Promise.all([
      new Promise<PendingSessionMeta | undefined>((resolve, reject) => {
        metaRequest.onsuccess = () => resolve(metaRequest.result as PendingSessionMeta | undefined);
        metaRequest.onerror = () => reject(metaRequest.error);
      }),
      new Promise<Array<{ chunk: Blob }>>((resolve, reject) => {
        chunksRequest.onsuccess = () => resolve((chunksRequest.result as Array<{ chunk: Blob }>) ?? []);
        chunksRequest.onerror = () => reject(chunksRequest.error);
      }),
    ]);
    if (!meta || rows.length === 0) return null;
    const blob = new Blob(
      rows.map((row) => row.chunk),
      { type: meta.mimeType || "audio/webm" },
    );
    if (blob.size === 0) return null;
    return { blob, meta };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearSession(draftId: string, sessionId: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    const key = sessionKey(draftId, sessionId);
    const tx = db.transaction([CHUNKS_STORE, SESSIONS_STORE], "readwrite");
    tx.objectStore(SESSIONS_STORE).delete(key);
    const index = tx.objectStore(CHUNKS_STORE).index("bySession");
    const cursorRequest = index.openCursor(key);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await txDone(tx);
  } catch {
    // Best-effort cleanup.
  } finally {
    db.close();
  }
}
