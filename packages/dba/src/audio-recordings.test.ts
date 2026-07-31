import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertValidAudioRecordingId,
  AudioRecordingError,
  AUDIO_RECORDING_MAX_BYTES,
  buildAudioRecordingFileName,
  assertSafeResolvedPath,
  getAudioRecordingReadInfo,
  listAudioRecordings,
  normalizeAudioRecordingDisplayName,
  resolveAudioExtension,
  saveAudioRecording,
} from "./audio-recordings.js";
import { runWithRepoContext } from "./repo-context.js";

describe("audio-recordings helpers", () => {
  it("maps supported MIME types to extensions", () => {
    expect(resolveAudioExtension("audio/webm")).toBe("webm");
    expect(resolveAudioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(resolveAudioExtension("audio/ogg;codecs=opus")).toBe("ogg");
    expect(resolveAudioExtension("application/octet-stream")).toBeNull();
    expect(resolveAudioExtension("")).toBeNull();
  });

  it("builds collision-resistant server filenames", () => {
    const name = buildAudioRecordingFileName("webm", new Date("2026-07-30T12:34:56"));
    expect(name).toMatch(/^2026-07-30_12-34-56_[0-9a-f-]{36}\.webm$/i);
  });

  it("rejects path traversal in file names", () => {
    expect(() => assertSafeResolvedPath("/tmp/audio", "../etc/passwd")).toThrow(
      AudioRecordingError,
    );
    expect(() => assertSafeResolvedPath("/tmp/audio", "ok.webm")).not.toThrow();
  });

  it("normalizes display names without turning them into paths", () => {
    expect(normalizeAudioRecordingDisplayName("  a \n b \t c  ")).toBe("a b c");
  });

  it("rejects traversal-like ids", () => {
    expect(() => assertValidAudioRecordingId("../x")).toThrow(AudioRecordingError);
    expect(() => assertValidAudioRecordingId("safe-file.webm")).not.toThrow();
  });
});

describe("saveAudioRecording", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-audio-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("writes file + metadata into the configured root directory", async () => {
    const bytes = new TextEncoder().encode("fake-webm-bytes");
    const result = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      saveAudioRecording({
        bytes,
        mimeType: "audio/webm",
        displayName: "2026-07-30_trening-verbal-game",
        recordedDate: "2026-07-30",
        durationMs: 12_345,
        rootDirectory: rootDir,
      }),
    );
    expect(result.fileName).toMatch(/\.webm$/);
    expect(result.sizeBytes).toBe(bytes.byteLength);
    const onDisk = await readFile(path.join(rootDir, result.fileName));
    expect(Buffer.compare(onDisk, Buffer.from(bytes))).toBe(0);
    const readInfo = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      getAudioRecordingReadInfo(result.id, { rootDirectory: rootDir }),
    );
    expect(readInfo?.displayName).toBe("2026-07-30_trening-verbal-game");
    expect(readInfo?.durationMs).toBe(12_345);
  });

  it("auto-increments date-only names for subsequent recordings on the same day", async () => {
    const first = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      saveAudioRecording({
        bytes: new TextEncoder().encode("one"),
        mimeType: "audio/webm",
        displayName: "2026-07-30",
        recordedDate: "2026-07-30",
        rootDirectory: rootDir,
      }),
    );
    const second = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      saveAudioRecording({
        bytes: new TextEncoder().encode("two"),
        mimeType: "audio/webm",
        displayName: "2026-07-30",
        recordedDate: "2026-07-30",
        rootDirectory: rootDir,
      }),
    );
    const third = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      saveAudioRecording({
        bytes: new TextEncoder().encode("three"),
        mimeType: "audio/webm",
        displayName: "2026-07-30",
        recordedDate: "2026-07-30",
        rootDirectory: rootDir,
      }),
    );
    expect(first.displayName).toBe("2026-07-30");
    expect(second.displayName).toBe("2026-07-30b");
    expect(third.displayName).toBe("2026-07-30c");
  });

  it("lists recordings and isolates metadata-backed files by repoGuid", async () => {
    await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      saveAudioRecording({
        bytes: new TextEncoder().encode("a"),
        mimeType: "audio/webm",
        displayName: "2026-07-30_a",
        recordedDate: "2026-07-30",
        rootDirectory: rootDir,
      }),
    );
    await runWithRepoContext({ repoGuid: "repo-b", username: "b" }, () =>
      saveAudioRecording({
        bytes: new TextEncoder().encode("b"),
        mimeType: "audio/ogg",
        displayName: "2026-07-31_b",
        recordedDate: "2026-07-31",
        rootDirectory: rootDir,
      }),
    );
    const listA = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      listAudioRecordings({ rootDirectory: rootDir }),
    );
    const listB = await runWithRepoContext({ repoGuid: "repo-b", username: "b" }, () =>
      listAudioRecordings({ rootDirectory: rootDir }),
    );
    expect(listA).toHaveLength(1);
    expect(listA[0]?.displayName).toBe("2026-07-30_a");
    expect(listB).toHaveLength(1);
    expect(listB[0]?.displayName).toBe("2026-07-31_b");
  });

  it("lists legacy flat files without metadata as a compatibility fallback", async () => {
    const legacyPath = path.join(rootDir, "2026-07-30_09-12-33_legacy.webm");
    await rm(legacyPath, { force: true });
    await writeFile(legacyPath, new Uint8Array([1, 2, 3]));
    const list = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      listAudioRecordings({ rootDirectory: rootDir }),
    );
    expect(list.some((item) => item.id === "2026-07-30_09-12-33_legacy.webm")).toBe(true);
  });

  it("returns an empty list when the repo has no recordings", async () => {
    const list = await runWithRepoContext({ repoGuid: "repo-empty", username: "empty" }, () =>
      listAudioRecordings({ rootDirectory: rootDir }),
    );
    expect(list).toEqual([]);
  });

  it("rejects invalid MIME", async () => {
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        saveAudioRecording({
          bytes: new Uint8Array([1, 2, 3]),
          mimeType: "text/plain",
          displayName: "2026-07-30_bad",
          recordedDate: "2026-07-30",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("rejects empty payload", async () => {
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        saveAudioRecording({
          bytes: new Uint8Array(),
          mimeType: "audio/webm",
          displayName: "2026-07-30_empty",
          recordedDate: "2026-07-30",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("rejects oversized payload", async () => {
    const bytes = new Uint8Array(AUDIO_RECORDING_MAX_BYTES + 1);
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        saveAudioRecording({
          bytes,
          mimeType: "audio/ogg",
          displayName: "2026-07-30_big",
          recordedDate: "2026-07-30",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("rejects invalid recordedDate", async () => {
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        saveAudioRecording({
          bytes: new Uint8Array([1]),
          mimeType: "audio/webm",
          displayName: "2026-07-99_bad-date",
          recordedDate: "2026-07-99",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_DATE" });
  });

  it("rejects empty displayName", async () => {
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        saveAudioRecording({
          bytes: new Uint8Array([1]),
          mimeType: "audio/webm",
          displayName: "   ",
          recordedDate: "2026-07-30",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_DISPLAY_NAME" });
  });

  it("blocks traversal when reading a recording id", async () => {
    await expect(
      runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
        getAudioRecordingReadInfo("../nope", { rootDirectory: rootDir }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_ID" });
  });

  it("returns null when a recording does not exist", async () => {
    const result = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      getAudioRecordingReadInfo("missing.webm", { rootDirectory: rootDir }),
    );
    expect(result).toBeNull();
  });

  it("reads a legacy flat file without metadata", async () => {
    const legacyPath = path.join(rootDir, "2026-07-30_09-12-33_legacy.webm");
    await writeFile(legacyPath, new Uint8Array([1, 2, 3]));
    const result = await runWithRepoContext({ repoGuid: "repo-a", username: "a" }, () =>
      getAudioRecordingReadInfo("2026-07-30_09-12-33_legacy.webm", { rootDirectory: rootDir }),
    );
    expect(result?.displayName).toBe("2026-07-30_09-12-33_legacy");
  });
});
