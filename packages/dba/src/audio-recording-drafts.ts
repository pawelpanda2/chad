/**
 * Draft audio recordings (Story 93 follow-up): multi-segment drafts that
 * survive page refreshes, finalized into ONE valid audio file.
 *
 * Why segments exist at all: MediaRecorder cannot survive a page refresh, so
 * every browser session produces its own complete container (WebM/Ogg). Raw
 * `new Blob([seg1, seg2])` concatenation of complete containers is invalid —
 * players report only the first segment's duration. Finalization therefore
 * remuxes/appends via `mkvmerge` (mkvtoolnix), which writes a correct
 * Duration header + cues (also fixing MediaRecorder's missing-duration
 * quirk for single-segment recordings).
 *
 * Storage layout (Story 112 — per-user under referenced files):
 *
 *   <CHAD_CONTACT_PHOTOS_DIR>/<user>/10_files_audio/drafts/<draftId>/draft.json
 *   <CHAD_CONTACT_PHOTOS_DIR>/<user>/10_files_audio/drafts/<draftId>/segment-<sessionId>.<ext>
 *
 * Final recordings live in the sibling `…/recordings/` directory.
 *
 * Every write is atomic: temp file in the same directory → rename. The
 * draft.json is the single source of truth — a segment file not referenced
 * by it does not exist as far as reads are concerned.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getCurrentRepoGuid } from "./repo-context.js";
import {
  isCp1StorageFailure,
  maybeRequestCp1Repair,
} from "./file-storage/cp1-storage-failure.js";
import {
  AUDIO_RECORDING_MAX_BYTES,
  AudioRecordingError,
  assertSafeResolvedPath,
  getUserAudioDraftsDir,
  getUserAudioRecordingsWriteDir,
  resolveAudioExtension,
  isValidIsoLocalDate,
  normalizeAudioRecordingDisplayName,
  saveAudioRecording,
  type SaveAudioRecordingResult,
} from "./audio-recordings.js";

const execFileAsync = promisify(execFile);

export const AUDIO_DRAFT_MAX_SEGMENTS = 50;

const DRAFTS_DIR_NAME = "drafts";
const DRAFT_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export type AudioDraftStatus = "draft" | "finalizing" | "error";

export interface AudioDraftSegment {
  sessionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  uploadedAt: string;
  /** true = mid-session checkpoint that will be replaced by the session's final upload. */
  provisional: boolean;
}

export interface AudioRecordingDraft {
  id: string;
  repoGuid: string;
  displayName: string;
  recordedDate: string;
  createdAt: string;
  updatedAt: string;
  status: AudioDraftStatus;
  error?: string;
  finalizedRecordingId?: string;
  segments: AudioDraftSegment[];
}

export interface AudioDraftListItem {
  id: string;
  displayName: string;
  recordedDate: string;
  createdAt: string;
  updatedAt: string;
  status: AudioDraftStatus;
  error?: string;
  segmentsCount: number;
  totalDurationMs: number;
  totalSizeBytes: number;
}

function assertValidDraftId(id: string): string {
  const trimmed = id.trim().toLowerCase();
  if (!DRAFT_ID_PATTERN.test(trimmed)) {
    throw new AudioRecordingError("INVALID_ID", "Invalid draft id");
  }
  return trimmed;
}

function assertValidSessionId(id: string): string {
  const trimmed = id.trim();
  if (!SESSION_ID_PATTERN.test(trimmed) || trimmed.includes("..")) {
    throw new AudioRecordingError("INVALID_ID", "Invalid segment session id");
  }
  return trimmed;
}

function draftDir(draftsRoot: string, draftId: string): string {
  return assertSafeResolvedPath(draftsRoot, assertValidDraftId(draftId));
}

/** Absolute path to the drafts directory (not the recordings parent). */
function resolveDraftsRoot(rootDirectory?: string): string {
  if (rootDirectory) return path.resolve(rootDirectory, DRAFTS_DIR_NAME);
  return getUserAudioDraftsDir();
}

/** Absolute path where finalized recordings are written. */
function resolveRecordingsRoot(rootDirectory?: string): string {
  if (rootDirectory) return path.resolve(rootDirectory);
  return getUserAudioRecordingsWriteDir();
}

function toListItem(draft: AudioRecordingDraft): AudioDraftListItem {
  const segments = draft.segments;
  const item: AudioDraftListItem = {
    id: draft.id,
    displayName: draft.displayName,
    recordedDate: draft.recordedDate,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    status: draft.status,
    segmentsCount: segments.length,
    totalDurationMs: segments.reduce((sum, s) => sum + (s.durationMs || 0), 0),
    totalSizeBytes: segments.reduce((sum, s) => sum + (s.sizeBytes || 0), 0),
  };
  if (draft.error) item.error = draft.error;
  return item;
}

function parseDraft(raw: string): AudioRecordingDraft | null {
  try {
    const parsed = JSON.parse(raw) as Partial<AudioRecordingDraft>;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.repoGuid !== "string" ||
      typeof parsed.displayName !== "string" ||
      typeof parsed.recordedDate !== "string" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string" ||
      !Array.isArray(parsed.segments)
    ) {
      return null;
    }
    const status: AudioDraftStatus =
      parsed.status === "finalizing" || parsed.status === "error" ? parsed.status : "draft";
    const segments: AudioDraftSegment[] = [];
    for (const seg of parsed.segments) {
      if (
        !seg ||
        typeof seg.sessionId !== "string" ||
        typeof seg.fileName !== "string" ||
        typeof seg.mimeType !== "string" ||
        typeof seg.sizeBytes !== "number"
      ) {
        return null;
      }
      segments.push({
        sessionId: seg.sessionId,
        fileName: seg.fileName,
        mimeType: seg.mimeType,
        sizeBytes: seg.sizeBytes,
        durationMs: typeof seg.durationMs === "number" ? seg.durationMs : 0,
        uploadedAt: typeof seg.uploadedAt === "string" ? seg.uploadedAt : parsed.updatedAt,
        provisional: seg.provisional === true,
      });
    }
    const draft: AudioRecordingDraft = {
      id: parsed.id,
      repoGuid: parsed.repoGuid,
      displayName: parsed.displayName,
      recordedDate: parsed.recordedDate,
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      status,
      segments,
    };
    if (typeof parsed.error === "string") draft.error = parsed.error;
    if (typeof parsed.finalizedRecordingId === "string") {
      draft.finalizedRecordingId = parsed.finalizedRecordingId;
    }
    return draft;
  } catch {
    return null;
  }
}

/** Atomic write: temp file in the target directory → rename over the target. */
async function writeFileAtomic(targetPath: string, data: Uint8Array | string): Promise<void> {
  const tmpPath = `${targetPath}.${randomUUID().slice(0, 8)}.tmp`;
  await writeFile(tmpPath, data);
  try {
    await rename(tmpPath, targetPath);
  } catch (error) {
    await unlink(tmpPath).catch(() => {});
    throw error;
  }
}

async function writeDraftJson(rootDir: string, draft: AudioRecordingDraft): Promise<void> {
  const dir = draftDir(rootDir, draft.id);
  await writeFileAtomic(path.join(dir, "draft.json"), JSON.stringify(draft, null, 2));
}

/**
 * Loads a draft and enforces ownership: a draft belonging to another
 * repoGuid behaves exactly like a missing one (null) — same non-enumeration
 * approach getAudioRecordingReadInfo takes.
 */
async function readDraft(
  rootDir: string,
  draftId: string,
  repoGuid: string,
): Promise<AudioRecordingDraft | null> {
  const dir = draftDir(rootDir, draftId);
  let raw: string;
  try {
    raw = await readFile(path.join(dir, "draft.json"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new AudioRecordingError("WRITE_FAILED", "Could not read draft");
  }
  const draft = parseDraft(raw);
  if (!draft || draft.repoGuid !== repoGuid) return null;
  return draft;
}

export interface CreateAudioDraftInput {
  displayName?: string;
  recordedDate: string;
  rootDirectory?: string;
  repoGuid?: string;
}

export async function createAudioRecordingDraft(
  input: CreateAudioDraftInput,
): Promise<AudioRecordingDraft> {
  if (!isValidIsoLocalDate(input.recordedDate)) {
    throw new AudioRecordingError("INVALID_DATE", "Recording date is invalid");
  }
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(input.rootDirectory);
  const displayName = normalizeAudioRecordingDisplayName(input.displayName ?? "");
  if (displayName.length > 180) {
    throw new AudioRecordingError("INVALID_DISPLAY_NAME", "Recording name is too long");
  }
  const now = new Date().toISOString();
  const draft: AudioRecordingDraft = {
    id: randomUUID(),
    repoGuid,
    displayName,
    recordedDate: input.recordedDate,
    createdAt: now,
    updatedAt: now,
    status: "draft",
    segments: [],
  };
  try {
    await mkdir(draftDir(rootDir, draft.id), { recursive: true });
    await writeDraftJson(rootDir, draft);
  } catch (error) {
    if (error instanceof AudioRecordingError) throw error;
    throw new AudioRecordingError("WRITE_FAILED", "Could not create draft");
  }
  return draft;
}

export async function getAudioRecordingDraft(
  draftId: string,
  options?: { rootDirectory?: string; repoGuid?: string },
): Promise<AudioRecordingDraft | null> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(options?.rootDirectory);
  return readDraft(rootDir, draftId, repoGuid);
}

/**
 * Lists the current user's drafts (newest first). Drafts that already have a
 * finalizedRecordingId are hidden — their final recording is already visible
 * in the normal saved list, and showing both would duplicate the entry.
 */
export async function listAudioRecordingDrafts(options?: {
  rootDirectory?: string;
  repoGuid?: string;
}): Promise<AudioDraftListItem[]> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(options?.rootDirectory);
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw new AudioRecordingError("WRITE_FAILED", "Could not list drafts");
  }
  const drafts = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && DRAFT_ID_PATTERN.test(entry.name))
      .map(async (entry) => {
        try {
          return await readDraft(rootDir, entry.name, repoGuid);
        } catch {
          // One unreadable draft (e.g. SMB dropout) must not fail the list.
          return null;
        }
      }),
  );
  return drafts
    .filter((draft): draft is AudioRecordingDraft => draft !== null && !draft.finalizedRecordingId)
    .map(toListItem)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface SaveDraftSegmentInput {
  draftId: string;
  /** One id per MediaRecorder session — a re-upload with the same id REPLACES the previous bytes (checkpoint model). */
  sessionId: string;
  bytes: Uint8Array;
  mimeType: string;
  durationMs: number;
  /** false = mid-session checkpoint (will be replaced); true = the session's final upload. */
  final: boolean;
  rootDirectory?: string;
  repoGuid?: string;
}

export async function saveAudioRecordingDraftSegment(
  input: SaveDraftSegmentInput,
): Promise<AudioRecordingDraft> {
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(input.rootDirectory);
  const sessionId = assertValidSessionId(input.sessionId);
  const ext = resolveAudioExtension(input.mimeType);
  if (!ext) {
    throw new AudioRecordingError("INVALID_MIME", "Unsupported audio type");
  }
  if (!input.bytes || input.bytes.byteLength === 0) {
    throw new AudioRecordingError("EMPTY", "Segment is empty");
  }
  if (input.bytes.byteLength > AUDIO_RECORDING_MAX_BYTES) {
    throw new AudioRecordingError("TOO_LARGE", "Segment exceeds size limit");
  }
  if (!Number.isFinite(input.durationMs) || input.durationMs < 0 || input.durationMs > 24 * 60 * 60 * 1000) {
    throw new AudioRecordingError("WRITE_FAILED", "Segment duration is invalid");
  }

  const draft = await readDraft(rootDir, input.draftId, repoGuid);
  if (!draft) {
    throw new AudioRecordingError("INVALID_ID", "Draft not found");
  }
  if (draft.status === "finalizing") {
    throw new AudioRecordingError("WRITE_FAILED", "Draft is being finalized");
  }

  const existingIndex = draft.segments.findIndex((s) => s.sessionId === sessionId);
  if (existingIndex === -1 && draft.segments.length >= AUDIO_DRAFT_MAX_SEGMENTS) {
    throw new AudioRecordingError("TOO_LARGE", "Too many segments in draft");
  }
  const otherBytes = draft.segments.reduce(
    (sum, s, i) => (i === existingIndex ? sum : sum + s.sizeBytes),
    0,
  );
  if (otherBytes + input.bytes.byteLength > AUDIO_RECORDING_MAX_BYTES) {
    throw new AudioRecordingError("TOO_LARGE", "Recording exceeds size limit");
  }

  const dir = draftDir(rootDir, draft.id);
  const fileName = `segment-${sessionId}.${ext}`;
  const segment: AudioDraftSegment = {
    sessionId,
    fileName,
    mimeType: input.mimeType.trim().toLowerCase(),
    sizeBytes: input.bytes.byteLength,
    durationMs: Math.round(input.durationMs),
    uploadedAt: new Date().toISOString(),
    provisional: !input.final,
  };

  try {
    // Segment bytes first, metadata second — draft.json must never point at
    // a file that does not exist yet.
    await writeFileAtomic(assertSafeResolvedPath(dir, fileName), input.bytes);
    const previousFileName = existingIndex >= 0 ? draft.segments[existingIndex].fileName : null;
    if (existingIndex >= 0) {
      draft.segments[existingIndex] = segment;
    } else {
      draft.segments.push(segment);
    }
    if (draft.status === "error") {
      draft.status = "draft";
      delete draft.error;
    }
    draft.updatedAt = segment.uploadedAt;
    await writeDraftJson(rootDir, draft);
    if (previousFileName && previousFileName !== fileName) {
      // Same session re-uploaded with a different extension — the old bytes
      // are no longer referenced; best-effort cleanup.
      await unlink(assertSafeResolvedPath(dir, previousFileName)).catch(() => {});
    }
  } catch (error) {
    if (error instanceof AudioRecordingError) throw error;
    maybeRequestCp1Repair(error, "audio-drafts");
    if (isCp1StorageFailure(error)) {
      throw new AudioRecordingError(
        "STORAGE_UNAVAILABLE",
        "Storage unavailable — repairing…",
      );
    }
    throw new AudioRecordingError("WRITE_FAILED", "Could not save segment");
  }
  return draft;
}

export interface AudioDraftSegmentReadInfo extends AudioDraftSegment {
  filePath: string;
}

export async function getAudioRecordingDraftSegmentReadInfo(
  draftId: string,
  sessionId: string,
  options?: { rootDirectory?: string; repoGuid?: string },
): Promise<AudioDraftSegmentReadInfo | null> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(options?.rootDirectory);
  const safeSessionId = assertValidSessionId(sessionId);
  const draft = await readDraft(rootDir, draftId, repoGuid);
  if (!draft) return null;
  const segment = draft.segments.find((s) => s.sessionId === safeSessionId);
  if (!segment) return null;
  const filePath = assertSafeResolvedPath(draftDir(rootDir, draft.id), segment.fileName);
  try {
    const st = await stat(filePath);
    if (!st.isFile()) return null;
  } catch {
    return null;
  }
  return { ...segment, filePath };
}

export async function discardAudioRecordingDraft(
  draftId: string,
  options?: { rootDirectory?: string; repoGuid?: string },
): Promise<boolean> {
  const repoGuid = options?.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(options?.rootDirectory);
  const draft = await readDraft(rootDir, draftId, repoGuid);
  if (!draft) return false;
  if (draft.status === "finalizing") {
    throw new AudioRecordingError("WRITE_FAILED", "Draft is being finalized");
  }
  try {
    await rm(draftDir(rootDir, draft.id), { recursive: true, force: true });
  } catch {
    throw new AudioRecordingError("WRITE_FAILED", "Could not discard draft");
  }
  return true;
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

let mkvmergeAvailability: Promise<boolean> | null = null;

/** Cached PATH probe — mkvmerge is baked into the Docker image; on bare Mac it comes from brew. */
export function isMkvmergeAvailable(): Promise<boolean> {
  if (!mkvmergeAvailability) {
    mkvmergeAvailability = execFileAsync("mkvmerge", ["--version"]).then(
      () => true,
      () => false,
    );
  }
  return mkvmergeAvailability;
}

/** Test hook — resets the cached probe result. */
export function resetMkvmergeAvailabilityCache(): void {
  mkvmergeAvailability = null;
}

function isMkvmergeMergeable(mimeType: string): boolean {
  // mkvmerge reads WebM and Ogg-Opus and writes WebM. MP4/AAC (Safari) and
  // MP3/WAV cannot be muxed into a WebM container.
  const base = mimeType.split(";")[0]?.trim().toLowerCase();
  return base === "audio/webm" || base === "audio/ogg";
}

async function mergeSegmentsWithMkvmerge(
  segmentPaths: string[],
  outputPath: string,
): Promise<void> {
  const args = ["--webm", "--quiet", "-o", outputPath];
  segmentPaths.forEach((segmentPath, index) => {
    if (index > 0) args.push("+");
    args.push(segmentPath);
  });
  // mkvmerge exit code 1 = warnings only (output still valid), 2 = error.
  try {
    await execFileAsync("mkvmerge", args, { timeout: 120_000 });
  } catch (error) {
    const code = (error as { code?: number | string }).code;
    if (code !== 1) {
      throw new AudioRecordingError("WRITE_FAILED", "Could not merge segments");
    }
  }
}

/** Serializes concurrent finalize calls per draft within this process (double-click Save). */
const finalizeLocks = new Map<string, Promise<SaveAudioRecordingResult>>();

export interface FinalizeAudioDraftInput {
  draftId: string;
  displayName?: string;
  rootDirectory?: string;
  repoGuid?: string;
}

/**
 * Merges all draft segments into ONE valid audio file in the recordings
 * root (+ sidecar metadata), then removes the draft directory.
 *
 * Idempotent: a draft that was already finalized returns the stored result
 * instead of writing a second file; concurrent calls for the same draft are
 * serialized in-process.
 */
export async function finalizeAudioRecordingDraft(
  input: FinalizeAudioDraftInput,
): Promise<SaveAudioRecordingResult> {
  const draftId = assertValidDraftId(input.draftId);
  const existing = finalizeLocks.get(draftId);
  if (existing) return existing;
  const task = finalizeDraftInner(input).finally(() => {
    finalizeLocks.delete(draftId);
  });
  finalizeLocks.set(draftId, task);
  return task;
}

async function finalizeDraftInner(
  input: FinalizeAudioDraftInput,
): Promise<SaveAudioRecordingResult> {
  const repoGuid = input.repoGuid ?? getCurrentRepoGuid();
  const rootDir = resolveDraftsRoot(input.rootDirectory);
  const draft = await readDraft(rootDir, input.draftId, repoGuid);
  if (!draft) {
    throw new AudioRecordingError("INVALID_ID", "Draft not found");
  }

  const recordingsDir = resolveRecordingsRoot(input.rootDirectory);

  if (draft.finalizedRecordingId) {
    // Already finalized (e.g. retry after a lost response). Return the
    // existing recording instead of creating a duplicate.
    const finalized = await buildResultForFinalized(draft, recordingsDir);
    await rm(draftDir(rootDir, draft.id), { recursive: true, force: true }).catch(() => {});
    return finalized;
  }

  if (draft.segments.length === 0) {
    throw new AudioRecordingError("EMPTY", "Draft has no recorded segments");
  }

  const dir = draftDir(rootDir, draft.id);
  const segmentPaths = draft.segments.map((s) => assertSafeResolvedPath(dir, s.fileName));
  for (const segmentPath of segmentPaths) {
    try {
      const st = await stat(segmentPath);
      if (!st.isFile() || st.size === 0) {
        throw new Error("missing");
      }
    } catch {
      throw new AudioRecordingError("WRITE_FAILED", "A draft segment file is missing");
    }
  }

  draft.status = "finalizing";
  draft.updatedAt = new Date().toISOString();
  await writeDraftJson(rootDir, draft);

  try {
    const totalDurationMs = draft.segments.reduce((sum, s) => sum + (s.durationMs || 0), 0);
    const displayNameInput =
      normalizeAudioRecordingDisplayName(input.displayName ?? "") || draft.displayName || draft.recordedDate;

    let finalBytes: Uint8Array;
    let finalMime: string;
    const allMergeable = draft.segments.every((s) => isMkvmergeMergeable(s.mimeType));
    const mkvmergeReady = allMergeable && (await isMkvmergeAvailable());

    if (mkvmergeReady) {
      // Remux even single segments: mkvmerge writes the Duration header +
      // cues that MediaRecorder's streamed WebM lacks (fixes <audio>
      // showing Infinity / only-first-segment duration and broken seeking).
      const mergedPath = path.join(dir, `merged.${randomUUID().slice(0, 8)}.webm`);
      try {
        await mergeSegmentsWithMkvmerge(segmentPaths, mergedPath);
        finalBytes = new Uint8Array(await readFile(mergedPath));
        finalMime = "audio/webm";
      } finally {
        await unlink(mergedPath).catch(() => {});
      }
    } else if (draft.segments.length === 1) {
      // No merge tool (bare Mac without mkvtoolnix) or non-WebM format —
      // a single segment is already one valid container, store it as-is.
      finalBytes = new Uint8Array(await readFile(segmentPaths[0]));
      finalMime = draft.segments[0].mimeType;
    } else {
      throw new AudioRecordingError(
        "WRITE_FAILED",
        allMergeable
          ? "Merging segments requires mkvmerge, which is not available on this server"
          : "Draft segments use formats that cannot be merged",
      );
    }

    if (finalBytes.byteLength > AUDIO_RECORDING_MAX_BYTES) {
      throw new AudioRecordingError("TOO_LARGE", "Recording exceeds size limit");
    }

    const result = await saveAudioRecording({
      bytes: finalBytes,
      mimeType: finalMime,
      displayName: displayNameInput,
      recordedDate: draft.recordedDate,
      durationMs: totalDurationMs > 0 ? totalDurationMs : undefined,
      rootDirectory: recordingsDir,
      repoGuid,
    });

    // Record the finalized id BEFORE deleting anything — if the cleanup
    // below fails (SMB dropout), a retry finds finalizedRecordingId and
    // returns this same recording instead of producing a duplicate.
    draft.finalizedRecordingId = result.id;
    draft.status = "draft";
    draft.updatedAt = new Date().toISOString();
    await writeDraftJson(rootDir, draft);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    return result;
  } catch (error) {
    // Failed finalization keeps the draft (and all segment files) available
    // for a retry — only the status/error marker changes.
    draft.status = "error";
    draft.error =
      error instanceof AudioRecordingError ? error.message : "Finalization failed";
    draft.updatedAt = new Date().toISOString();
    await writeDraftJson(rootDir, draft).catch(() => {});
    if (error instanceof AudioRecordingError) throw error;
    throw new AudioRecordingError("WRITE_FAILED", "Finalization failed");
  }
}

async function buildResultForFinalized(
  draft: AudioRecordingDraft,
  rootDir: string,
): Promise<SaveAudioRecordingResult> {
  const id = draft.finalizedRecordingId!;
  try {
    const metadataRaw = await readFile(assertSafeResolvedPath(rootDir, `${id}.json`), "utf8");
    const metadata = JSON.parse(metadataRaw) as {
      displayName?: string;
      recordedDate?: string;
      createdAt?: string;
      durationMs?: number;
      sizeBytes?: number;
      mimeType?: string;
    };
    return {
      id,
      fileName: id,
      displayName: metadata.displayName ?? draft.displayName,
      recordedDate: metadata.recordedDate ?? draft.recordedDate,
      createdAt: metadata.createdAt ?? draft.updatedAt,
      durationMs: metadata.durationMs,
      sizeBytes: metadata.sizeBytes ?? 0,
      mimeType: metadata.mimeType ?? "audio/webm",
    };
  } catch {
    return {
      id,
      fileName: id,
      displayName: draft.displayName,
      recordedDate: draft.recordedDate,
      createdAt: draft.updatedAt,
      sizeBytes: 0,
      mimeType: "audio/webm",
    };
  }
}
