/**
 * Forms / Views → recordings: binary audio files plus minimal sidecar metadata.
 *
 * Not Content Provider / not speech-to-text. Files live directly under
 * `process.env.CHAD_AUDIO_RECORDINGS_DIR` (path as seen by the Node process).
 * New writes store a sibling JSON metadata file that carries `repoGuid` for
 * per-user filtering; legacy flat audio files without metadata are still
 * readable as a compatibility fallback.
 *
 * Host Mac root target: `/Volumes/cp_1/02_files_refrenced/10_files_audio/`
 * (spelling `refrenced` is intentional — do not "fix").
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentRepoGuid, getCurrentUsername } from "./repo-context.js";
import { FILE_STORAGE_FEATURES } from "./file-storage/features.js";
import { resolveFeatureStorage } from "./file-storage/path-policy.js";

export const AUDIO_RECORDING_MAX_BYTES = 50 * 1024 * 1024; // 50 MiB

/** MIME → extension. Only these are accepted. */
export const AUDIO_RECORDING_MIME_TO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

export class AudioRecordingError extends Error {
  constructor(
    public readonly code:
      | "NOT_CONFIGURED"
      | "INVALID_MIME"
      | "INVALID_DATE"
      | "INVALID_DISPLAY_NAME"
      | "INVALID_ID"
      | "EMPTY"
      | "TOO_LARGE"
      | "WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AudioRecordingError";
  }
}

/** Legacy flat root (global `10_files_audio` mount) — still used for read/list compat. */
export function getAudioRecordingsDir(): string {
  const dir = process.env.CHAD_AUDIO_RECORDINGS_DIR?.trim();
  if (!dir) {
    throw new AudioRecordingError(
      "NOT_CONFIGURED",
      "Audio recordings directory is not configured",
    );
  }
  return path.resolve(dir);
}

/**
 * Story 111 — new writes go under
 * `<CHAD_CONTACT_PHOTOS_DIR>/<user>/10_files_audio/recordings/`.
 * Falls back to legacy flat `CHAD_AUDIO_RECORDINGS_DIR` only when photos root
 * is unavailable (tests that pass `rootDirectory` bypass this).
 */
export function getUserAudioRecordingsWriteDir(
  username?: string,
  rootDirectory?: string,
): string {
  if (rootDirectory) return path.resolve(rootDirectory);
  try {
    const user = username ?? getCurrentUsername();
    return resolveFeatureStorage(user, FILE_STORAGE_FEATURES.AUDIO_RECORDINGS);
  } catch {
    return getAudioRecordingsDir();
  }
}

/** Normalize MIME (strip parameters for lookup when needed). */
export function resolveAudioExtension(mimeType: string): string | null {
  const raw = mimeType.trim().toLowerCase();
  if (!raw) return null;
  if (AUDIO_RECORDING_MIME_TO_EXT[raw]) return AUDIO_RECORDING_MIME_TO_EXT[raw];
  const base = raw.split(";")[0]?.trim();
  if (base && AUDIO_RECORDING_MIME_TO_EXT[base]) return AUDIO_RECORDING_MIME_TO_EXT[base];
  return null;
}

/**
 * `YYYY-MM-DD_HH-mm-ss_<uuid>.<ext>` — collision-resistant; never from client.
 */
export function buildAudioRecordingFileName(ext: string, now: Date = new Date()): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${mi}-${s}_${randomUUID()}.${safeExt}`;
}

export function assertSafeResolvedPath(dir: string, fileName: string): string {
  const resolvedDir = path.resolve(dir);
  const full = path.resolve(resolvedDir, fileName);
  if (full !== resolvedDir && !full.startsWith(resolvedDir + path.sep)) {
    throw new AudioRecordingError("WRITE_FAILED", "Invalid recording path");
  }
  if (path.basename(fileName) !== fileName || fileName.includes("..")) {
    throw new AudioRecordingError("WRITE_FAILED", "Invalid recording name");
  }
  return full;
}

export interface SaveAudioRecordingInput {
  bytes: Uint8Array;
  mimeType: string;
  displayName: string;
  recordedDate: string;
  durationMs?: number;
  /** Root override for tests/scripts — never from client request. */
  rootDirectory?: string;
  /** Repo override for tests/scripts — never from client request. */
  repoGuid?: string;
}

export interface SaveAudioRecordingResult {
  id: string;
  fileName: string;
  displayName: string;
  recordedDate: string;
  createdAt: string;
  durationMs?: number;
  sizeBytes: number;
  mimeType: string;
}

export interface AudioRecordingMetadata {
  id: string;
  repoGuid: string;
  displayName: string;
  recordedDate: string;
  createdAt: string;
  durationMs?: number;
  mimeType: string;
  sizeBytes: number;
  storedFileName: string;
}

export interface AudioRecordingListItem {
  id: string;
  displayName: string;
  date: string;
  createdAt: string;
  durationMs?: number;
  mimeType: string;
  sizeBytes: number;
}

const AUDIO_RECORDING_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const AUDIO_RECORDING_FILE_EXTENSIONS = new Set(["webm", "ogg", "m4a", "mp3", "wav"]);

export function normalizeAudioRecordingDisplayName(displayName: string): string {
  return displayName.replace(/\s+/g, " ").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
}

export function isValidIsoLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

export function assertValidAudioRecordingId(id: string): string {
  const trimmed = id.trim();
  if (
    !trimmed ||
    !AUDIO_RECORDING_ID_PATTERN.test(trimmed) ||
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\")
  ) {
    throw new AudioRecordingError("INVALID_ID", "Invalid recording id");
  }
  return trimmed;
}

function metadataPathForId(id: string, rootDir: string): string {
  return assertSafeResolvedPath(rootDir, `${assertValidAudioRecordingId(id)}.json`);
}

function isAudioRecordingFileName(fileName: string): boolean {
  const ext = path.extname(fileName).replace(/^\./, "").toLowerCase();
  return AUDIO_RECORDING_FILE_EXTENSIONS.has(ext);
}

function parseMetadata(raw: string): AudioRecordingMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioRecordingMetadata>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.repoGuid !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.recordedDate !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.mimeType !== "string" ||
      typeof parsed.sizeBytes !== "number" ||
      typeof parsed.storedFileName !== "string"
    ) {
      return null;
    }
    return {
      id: parsed.id,
      repoGuid: parsed.repoGuid,
      displayName: parsed.displayName,
      recordedDate: parsed.recordedDate,
      createdAt: parsed.createdAt,
      durationMs: typeof parsed.durationMs === "number" ? parsed.durationMs : undefined,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      storedFileName: parsed.storedFileName,
    };
  } catch {
    return null;
  }
}

function buildLegacyListItem(fileName: string, createdAt: string, sizeBytes: number): AudioRecordingListItem {
  const ext = path.extname(fileName).replace(/^\./, "").toLowerCase();
  const stem = fileName.slice(0, -1 * (ext.length + 1));
  const datePrefix = /^(\d{4}-\d{2}-\d{2})/.exec(stem)?.[1] ?? createdAt.slice(0, 10);
  return {
    id: fileName,
    displayName: stem,
    date: datePrefix,
    createdAt,
    mimeType:
      ext === "ogg" ? "audio/ogg" : ext === "m4a" ? "audio/mp4" : ext === "mp3" ? "audio/mpeg" : ext === "wav" ? "audio/wav" : "audio/webm",
    sizeBytes,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function alphabetSuffixFromIndex(index: number): string {
  let remaining = index;
  let result = "";
  do {
    result = String.fromCharCode(97 + (remaining % 26)) + result;
    remaining = Math.floor(remaining / 26) - 1;
  } while (remaining >= 0);
  return result;
}

function buildAutoRecordingDisplayName(recordedDate: string, existingDisplayNames: string[]): string {
  const matchingPattern = new RegExp(`^${escapeRegExp(recordedDate)}([a-z]+)?$`);
  const used = new Set(
    existingDisplayNames
      .map((name) => name.trim().toLowerCase())
      .filter((name) => matchingPattern.test(name)),
  );
  if (!used.has(recordedDate.toLowerCase())) {
    return recordedDate;
  }
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${recordedDate}${alphabetSuffixFromIndex(index)}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${recordedDate}${randomUUID().slice(0, 8)}`;
}

export async function saveAudioRecording(
  input: SaveAudioRecordingInput,
): Promise<SaveAudioRecordingResult> {
  const mimeType = input.mimeType.trim().toLowerCase();
  const ext = resolveAudioExtension(mimeType);
  if (!ext) {
    throw new AudioRecordingError("INVALID_MIME", "Unsupported audio type");
  }
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new AudioRecordingError("EMPTY", "Recording is empty");
  }
  if (input.bytes.byteLength > AUDIO_RECORDING_MAX_BYTES) {
    throw new AudioRecordingError("TOO_LARGE", "Recording exceeds size limit");
  }
  if (!isValidIsoLocalDate(input.recordedDate)) {
    throw new AudioRecordingError("INVALID_DATE", "Recording date is invalid");
  }
  if (
    input.durationMs !== undefined &&
    (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > 24 * 60 * 60 * 1000)
  ) {
    throw new AudioRecordingError("WRITE_FAILED", "Recording duration is invalid");
  }

  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  // Story 111: prefer per-user recordings dir; tests may still inject rootDirectory.
  const rootDir = getUserAudioRecordingsWriteDir(undefined, input.rootDirectory);
  const requestedDisplayName = normalizeAudioRecordingDisplayName(input.displayName);
  const displayName =
    requestedDisplayName === input.recordedDate
      ? buildAutoRecordingDisplayName(
          input.recordedDate,
          (await listAudioRecordings({ rootDirectory: rootDir, repoGuid })).map(
            (item) => item.displayName,
          ),
        )
      : requestedDisplayName;
  if (!displayName) {
    throw new AudioRecordingError("INVALID_DISPLAY_NAME", "Recording name is required");
  }
  if (displayName.length > 180) {
    throw new AudioRecordingError("INVALID_DISPLAY_NAME", "Recording name is too long");
  }
  const fileName = buildAudioRecordingFileName(ext);
  const fullPath = assertSafeResolvedPath(rootDir, fileName);
  const createdAt = new Date().toISOString();
  const metadata: AudioRecordingMetadata = {
    id: fileName,
    repoGuid,
    displayName,
    recordedDate: input.recordedDate,
    createdAt,
    durationMs: input.durationMs,
    mimeType,
    sizeBytes: input.bytes.byteLength,
    storedFileName: fileName,
  };
  const metadataPath = metadataPathForId(metadata.id, rootDir);

  try {
    await mkdir(rootDir, { recursive: true });
    // wx: fail if exists — never overwrite.
    await writeFile(fullPath, input.bytes, { flag: "wx" });
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), { flag: "wx" });
  } catch (error) {
    if (error instanceof AudioRecordingError) throw error;
    throw new AudioRecordingError(
      "WRITE_FAILED",
      "Could not save recording",
    );
  }

  return {
    id: metadata.id,
    fileName,
    displayName,
    recordedDate: input.recordedDate,
    createdAt,
    durationMs: input.durationMs,
    sizeBytes: input.bytes.byteLength,
    mimeType,
  };
}

async function listAudioRecordingsFromDir(
  rootDir: string,
  repoGuid: string,
): Promise<AudioRecordingListItem[]> {
  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    // Every per-file read below is individually guarded: the backing volume
    // is a network share (SMB) that can drop mid-listing, and one unreadable
    // file must degrade to a missing row, never a failed whole list.
    const parsedMetadata = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          try {
            return parseMetadata(await readFile(assertSafeResolvedPath(rootDir, entry.name), "utf8"));
          } catch {
            return null;
          }
        }),
    );
    const metadataFileIds = new Set(
      parsedMetadata.filter((metadata): metadata is AudioRecordingMetadata => metadata !== null).map((metadata) => metadata.storedFileName),
    );
    const metadataItems = await Promise.all(
      parsedMetadata.map(async (metadata) => {
          if (!metadata || metadata.repoGuid !== repoGuid) return null;
          const filePath = assertSafeResolvedPath(rootDir, metadata.storedFileName);
          try {
            const st = await stat(filePath);
            if (!st.isFile()) return null;
          } catch {
            return null;
          }
          const item: AudioRecordingListItem = {
            id: metadata.id,
            displayName: metadata.displayName,
            date: metadata.recordedDate,
            createdAt: metadata.createdAt,
            mimeType: metadata.mimeType,
            sizeBytes: metadata.sizeBytes,
          };
          if (metadata.durationMs !== undefined) {
            item.durationMs = metadata.durationMs;
          }
          return item;
        }),
    );
    const nonNullMetadata: AudioRecordingListItem[] = metadataItems.filter(
      (item): item is AudioRecordingListItem => item !== null,
    );
    const legacyItems = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && !entry.name.endsWith(".json") && isAudioRecordingFileName(entry.name))
        .filter((entry) => !metadataFileIds.has(entry.name))
        .map(async (entry) => {
          try {
            const filePath = assertSafeResolvedPath(rootDir, entry.name);
            const fileStat = await stat(filePath);
            return buildLegacyListItem(entry.name, fileStat.mtime.toISOString(), fileStat.size);
          } catch {
            return null;
          }
        }),
    );
    const nonNullLegacy: AudioRecordingListItem[] = legacyItems.filter(
      (item): item is AudioRecordingListItem => item !== null,
    );
    return [...nonNullMetadata, ...nonNullLegacy].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    // Surface the real cause in server logs — "Could not list recordings"
    // alone made SMB-share dropouts undiagnosable.
    console.error(
      "[audio-recordings] listAudioRecordings failed:",
      error instanceof Error ? `${(error as NodeJS.ErrnoException).code ?? ""} ${error.message}` : error,
    );
    throw new AudioRecordingError("WRITE_FAILED", "Could not list recordings");
  }
}

export async function listAudioRecordings(options?: {
  rootDirectory?: string;
  repoGuid?: string;
}): Promise<AudioRecordingListItem[]> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  if (options?.rootDirectory) {
    return listAudioRecordingsFromDir(path.resolve(options.rootDirectory), repoGuid);
  }
  const dirs = new Set<string>();
  try {
    dirs.add(getAudioRecordingsDir());
  } catch {
    /* legacy mount optional */
  }
  try {
    dirs.add(getUserAudioRecordingsWriteDir());
  } catch {
    /* photos root optional */
  }
  const merged = new Map<string, AudioRecordingListItem>();
  for (const dir of dirs) {
    const items = await listAudioRecordingsFromDir(dir, repoGuid);
    for (const item of items) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
  }
  return [...merged.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface AudioRecordingReadInfo extends AudioRecordingMetadata {
  filePath: string;
}

async function getAudioRecordingReadInfoFromDir(
  rootDir: string,
  safeId: string,
  repoGuid: string,
): Promise<AudioRecordingReadInfo | null> {
  const metadataPath = metadataPathForId(safeId, rootDir);
  try {
    const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
    if (!metadata) return null;
    if (metadata.repoGuid !== repoGuid) return null;
    const filePath = assertSafeResolvedPath(rootDir, metadata.storedFileName);
    const st = await stat(filePath);
    if (!st.isFile()) return null;
    return { ...metadata, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      const filePath = assertSafeResolvedPath(rootDir, safeId);
      try {
        const fileStat = await stat(filePath);
        if (!fileStat.isFile() || !isAudioRecordingFileName(safeId)) return null;
        const legacy = buildLegacyListItem(safeId, fileStat.mtime.toISOString(), fileStat.size);
        return {
          id: legacy.id,
          repoGuid,
          displayName: legacy.displayName,
          recordedDate: legacy.date,
          createdAt: legacy.createdAt,
          mimeType: legacy.mimeType,
          sizeBytes: legacy.sizeBytes,
          storedFileName: safeId,
          filePath,
        };
      } catch {
        return null;
      }
    }
    if (error instanceof AudioRecordingError && error.code === "INVALID_ID") throw error;
    throw new AudioRecordingError("WRITE_FAILED", "Could not read recording");
  }
}

export async function getAudioRecordingReadInfo(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string },
): Promise<AudioRecordingReadInfo | null> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const safeId = assertValidAudioRecordingId(id);
  if (options?.rootDirectory) {
    return getAudioRecordingReadInfoFromDir(path.resolve(options.rootDirectory), safeId, repoGuid);
  }
  const dirs: string[] = [];
  try {
    dirs.push(getUserAudioRecordingsWriteDir());
  } catch {
    /* optional */
  }
  try {
    dirs.push(getAudioRecordingsDir());
  } catch {
    /* optional */
  }
  for (const dir of dirs) {
    const info = await getAudioRecordingReadInfoFromDir(dir, safeId, repoGuid);
    if (info) return info;
  }
  return null;
}
