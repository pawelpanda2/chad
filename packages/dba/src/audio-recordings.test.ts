/**
 * Unit tests for Forms → Add recording filesystem save helpers.
 * Uses a temp directory — never /Volumes/cp_1.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  saveAudioRecording,
  buildAudioRecordingFileName,
  resolveAudioExtension,
  assertSafeResolvedPath,
  AudioRecordingError,
  AUDIO_RECORDING_MAX_BYTES,
} from "./audio-recordings.js";

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
});

describe("saveAudioRecording", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "chad-audio-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes bytes under the temp directory with generated name", async () => {
    const bytes = new TextEncoder().encode("fake-webm-bytes");
    const result = await saveAudioRecording({
      bytes,
      mimeType: "audio/webm",
      directory: dir,
    });
    expect(result.fileName).toMatch(/\.webm$/);
    expect(result.sizeBytes).toBe(bytes.byteLength);
    const onDisk = await readFile(path.join(dir, result.fileName));
    expect(Buffer.compare(onDisk, Buffer.from(bytes))).toBe(0);
  });

  it("rejects invalid MIME", async () => {
    await expect(
      saveAudioRecording({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "text/plain",
        directory: dir,
      }),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("rejects empty payload", async () => {
    await expect(
      saveAudioRecording({
        bytes: new Uint8Array(),
        mimeType: "audio/webm",
        directory: dir,
      }),
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("rejects oversized payload", async () => {
    const bytes = new Uint8Array(AUDIO_RECORDING_MAX_BYTES + 1);
    await expect(
      saveAudioRecording({
        bytes,
        mimeType: "audio/ogg",
        directory: dir,
      }),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("does not accept a client-supplied absolute path as directory escape", async () => {
    // directory override is test-only; assertSafeResolvedPath still contains writes.
    const result = await saveAudioRecording({
      bytes: new Uint8Array([9]),
      mimeType: "audio/webm",
      directory: dir,
    });
    expect(path.dirname(path.join(dir, result.fileName))).toBe(path.resolve(dir));
  });
});
