/**
 * Forms → Add recording: save binary audio blobs to a configured directory.
 *
 * Not Content Provider / not speech-to-text. Destination is
 * `process.env.CHAD_AUDIO_RECORDINGS_DIR` (path as seen by the Node process).
 * Host Mac target: `/Volumes/cp_1/02_files_refrenced/10_files_audio/`
 * (spelling `refrenced` is intentional — do not "fix").
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

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
  /** Override dir for tests — never from client request. */
  directory?: string;
}

export interface SaveAudioRecordingResult {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
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

  const dir = input.directory ? path.resolve(input.directory) : getAudioRecordingsDir();
  const fileName = buildAudioRecordingFileName(ext);
  const fullPath = assertSafeResolvedPath(dir, fileName);

  try {
    await mkdir(dir, { recursive: true });
    // wx: fail if exists — never overwrite.
    await writeFile(fullPath, input.bytes, { flag: "wx" });
  } catch (error) {
    if (error instanceof AudioRecordingError) throw error;
    throw new AudioRecordingError(
      "WRITE_FAILED",
      "Could not save recording",
    );
  }

  return {
    fileName,
    sizeBytes: input.bytes.byteLength,
    mimeType,
  };
}
