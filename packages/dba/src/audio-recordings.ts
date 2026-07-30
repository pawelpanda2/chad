/**
 * Forms / Views → recordings: binary audio files plus minimal sidecar metadata.
 *
 * Not Content Provider / not speech-to-text. Files live under
 * `process.env.CHAD_AUDIO_RECORDINGS_DIR` (path as seen by the Node process),
 * isolated per CHAD repo/user in a `<root>/<repoGuid>/` subdirectory.
 *
 * Host Mac root target: `/Volumes/cp_1/02_files_refrenced/10_files_audio/`
 * (spelling `refrenced` is intentional — do not "fix").
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentRepoGuid } from "./repo-context.js";

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

export function getAudioRecordingsRepoDir(
  repoGuid: string = getCurrentRepoGuid(),
  rootDir: string = getAudioRecordingsDir(),
): string {
  return path.resolve(rootDir, repoGuid);
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

function metadataPathForId(id: string, repoDir: string): string {
  return assertSafeResolvedPath(repoDir, `${assertValidAudioRecordingId(id)}.json`);
}

function parseMetadata(raw: string): AudioRecordingMetadata | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioRecordingMetadata>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
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
  const displayName = normalizeAudioRecordingDisplayName(input.displayName);
  if (!displayName) {
    throw new AudioRecordingError("INVALID_DISPLAY_NAME", "Recording name is required");
  }
  if (displayName.length > 180) {
    throw new AudioRecordingError("INVALID_DISPLAY_NAME", "Recording name is too long");
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

  const repoDir = getAudioRecordingsRepoDir(
    input.repoGuid,
    input.rootDirectory ? path.resolve(input.rootDirectory) : getAudioRecordingsDir(),
  );
  const fileName = buildAudioRecordingFileName(ext);
  const fullPath = assertSafeResolvedPath(repoDir, fileName);
  const createdAt = new Date().toISOString();
  const metadata: AudioRecordingMetadata = {
    id: fileName,
    displayName,
    recordedDate: input.recordedDate,
    createdAt,
    durationMs: input.durationMs,
    mimeType,
    sizeBytes: input.bytes.byteLength,
    storedFileName: fileName,
  };
  const metadataPath = metadataPathForId(metadata.id, repoDir);

  try {
    await mkdir(repoDir, { recursive: true });
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

export async function listAudioRecordings(options?: {
  rootDirectory?: string;
  repoGuid?: string;
}): Promise<AudioRecordingListItem[]> {
  const repoDir = getAudioRecordingsRepoDir(
    options?.repoGuid,
    options?.rootDirectory ? path.resolve(options.rootDirectory) : getAudioRecordingsDir(),
  );
  try {
    const entries = await readdir(repoDir, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const metadata = parseMetadata(await readFile(assertSafeResolvedPath(repoDir, entry.name), "utf8"));
          if (!metadata) return null;
          const filePath = assertSafeResolvedPath(repoDir, metadata.storedFileName);
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
    const nonNullItems: AudioRecordingListItem[] = items.filter(
      (item): item is AudioRecordingListItem => item !== null,
    );
    return nonNullItems.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return [];
    }
    throw new AudioRecordingError("WRITE_FAILED", "Could not list recordings");
  }
}

export interface AudioRecordingReadInfo extends AudioRecordingMetadata {
  filePath: string;
}

export async function getAudioRecordingReadInfo(
  id: string,
  options?: { rootDirectory?: string; repoGuid?: string },
): Promise<AudioRecordingReadInfo | null> {
  const repoDir = getAudioRecordingsRepoDir(
    options?.repoGuid,
    options?.rootDirectory ? path.resolve(options.rootDirectory) : getAudioRecordingsDir(),
  );
  const metadataPath = metadataPathForId(id, repoDir);
  try {
    const metadata = parseMetadata(await readFile(metadataPath, "utf8"));
    if (!metadata) return null;
    const filePath = assertSafeResolvedPath(repoDir, metadata.storedFileName);
    const st = await stat(filePath);
    if (!st.isFile()) return null;
    return { ...metadata, filePath };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    if (error instanceof AudioRecordingError && error.code === "INVALID_ID") {
      throw error;
    }
    throw new AudioRecordingError("WRITE_FAILED", "Could not read recording");
  }
}
