/**
 * Draft audio recordings — unit + integration tests on temp dirs only.
 *
 * The merge-related tests use REAL audio fixtures: small Opus/WebM files
 * generated with ffmpeg through a pipe (so, like MediaRecorder output, they
 * carry NO Duration header) and merged with the real mkvmerge binary. When
 * ffmpeg or mkvmerge is missing the merge tests are SKIPPED and say so —
 * they never fake a pass.
 */

import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  createAudioRecordingDraft,
  saveAudioRecordingDraftSegment,
  listAudioRecordingDrafts,
  getAudioRecordingDraft,
  getAudioRecordingDraftSegmentReadInfo,
  discardAudioRecordingDraft,
  finalizeAudioRecordingDraft,
  isMkvmergeAvailable,
} from "./audio-recording-drafts.js";
import { AudioRecordingError, listAudioRecordings } from "./audio-recordings.js";

const execFileAsync = promisify(execFile);

const REPO_A = "11111111-aaaa-4aaa-8aaa-111111111111";
const REPO_B = "22222222-bbbb-4bbb-8bbb-222222222222";
const DATE = "2026-07-31";

let rootDir: string;
let ffmpegAvailable = false;
let mkvmergeAvailable = false;
/** Real Opus/WebM fixture bytes (no Duration header), ~4s each. */
const fixtures: Uint8Array[] = [];

async function makeWebmFixture(dir: string, index: number, seconds: number): Promise<Uint8Array> {
  const filePath = path.join(dir, `fixture-${index}.webm`);
  // Piping through stdout mirrors MediaRecorder: the muxer cannot seek back
  // to write a Duration header, so the file reports duration N/A.
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${300 + index * 200}:duration=${seconds}`,
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "webm",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
  );
  await writeFile(filePath, stdout);
  return new Uint8Array(stdout);
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      filePath,
    ]);
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

beforeAll(async () => {
  rootDir = await mkdtemp(path.join(tmpdir(), "audio-drafts-test-"));
  ffmpegAvailable = await execFileAsync("ffmpeg", ["-version"]).then(
    () => true,
    () => false,
  );
  mkvmergeAvailable = await isMkvmergeAvailable();
  if (ffmpegAvailable) {
    for (let i = 0; i < 3; i += 1) {
      fixtures.push(await makeWebmFixture(rootDir, i, 4));
    }
  }
}, 60_000);

afterAll(async () => {
  await rm(rootDir, { recursive: true, force: true });
});

function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("draft lifecycle", () => {
  it("creates, uploads segments, lists and reads back a draft", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(draft.status).toBe("draft");
    expect(draft.segments).toHaveLength(0);

    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "session-1",
      bytes: bytesOf("segment-one"),
      mimeType: "audio/webm",
      durationMs: 4000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });

    const listed = await listAudioRecordingDrafts({ rootDirectory: rootDir, repoGuid: REPO_A });
    const item = listed.find((d) => d.id === draft.id);
    expect(item).toBeTruthy();
    expect(item?.segmentsCount).toBe(1);
    expect(item?.totalDurationMs).toBe(4000);

    const info = await getAudioRecordingDraftSegmentReadInfo(draft.id, "session-1", {
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(info).toBeTruthy();
    expect(await readFile(info!.filePath, "utf8")).toBe("segment-one");
  });

  it("checkpoint re-upload with the same sessionId REPLACES the segment, never duplicates", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "sess",
      bytes: bytesOf("checkpoint-1"),
      mimeType: "audio/webm",
      durationMs: 1000,
      final: false,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    const updated = await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "sess",
      bytes: bytesOf("final-full-session"),
      mimeType: "audio/webm",
      durationMs: 9000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(updated.segments).toHaveLength(1);
    expect(updated.segments[0].provisional).toBe(false);
    expect(updated.segments[0].durationMs).toBe(9000);
    const info = await getAudioRecordingDraftSegmentReadInfo(draft.id, "sess", {
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(await readFile(info!.filePath, "utf8")).toBe("final-full-session");
  });

  it("discard removes the draft directory", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(
      await discardAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_A }),
    ).toBe(true);
    expect(
      await getAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_A }),
    ).toBeNull();
  });

  it("rejects an empty segment and invalid ids", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await expect(
      saveAudioRecordingDraftSegment({
        draftId: draft.id,
        sessionId: "sess",
        bytes: new Uint8Array(0),
        mimeType: "audio/webm",
        durationMs: 0,
        final: true,
        rootDirectory: rootDir,
        repoGuid: REPO_A,
      }),
    ).rejects.toMatchObject({ code: "EMPTY" });

    await expect(
      getAudioRecordingDraft("../../../etc", { rootDirectory: rootDir, repoGuid: REPO_A }),
    ).rejects.toMatchObject({ code: "INVALID_ID" });

    await expect(
      saveAudioRecordingDraftSegment({
        draftId: draft.id,
        sessionId: "../evil",
        bytes: bytesOf("x"),
        mimeType: "audio/webm",
        durationMs: 1,
        final: true,
        rootDirectory: rootDir,
        repoGuid: REPO_A,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ID" });
  });

  it("finalize of an empty draft fails with EMPTY and keeps the draft", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await expect(
      finalizeAudioRecordingDraft({ draftId: draft.id, rootDirectory: rootDir, repoGuid: REPO_A }),
    ).rejects.toMatchObject({ code: "EMPTY" });
    const after = await getAudioRecordingDraft(draft.id, {
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(after).toBeTruthy();
  });
});

describe("cross-user isolation", () => {
  it("another repoGuid cannot read, list, append to, finalize or discard the draft", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "sess",
      bytes: bytesOf("private"),
      mimeType: "audio/webm",
      durationMs: 1000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });

    expect(
      await getAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_B }),
    ).toBeNull();

    const listedForB = await listAudioRecordingDrafts({ rootDirectory: rootDir, repoGuid: REPO_B });
    expect(listedForB.find((d) => d.id === draft.id)).toBeUndefined();

    expect(
      await getAudioRecordingDraftSegmentReadInfo(draft.id, "sess", {
        rootDirectory: rootDir,
        repoGuid: REPO_B,
      }),
    ).toBeNull();

    await expect(
      saveAudioRecordingDraftSegment({
        draftId: draft.id,
        sessionId: "sess-b",
        bytes: bytesOf("intruder"),
        mimeType: "audio/webm",
        durationMs: 1,
        final: true,
        rootDirectory: rootDir,
        repoGuid: REPO_B,
      }),
    ).rejects.toMatchObject({ code: "INVALID_ID" });

    await expect(
      finalizeAudioRecordingDraft({ draftId: draft.id, rootDirectory: rootDir, repoGuid: REPO_B }),
    ).rejects.toMatchObject({ code: "INVALID_ID" });

    expect(
      await discardAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_B }),
    ).toBe(false);
    // Still there for the owner.
    expect(
      await getAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_A }),
    ).toBeTruthy();
  });
});

describe("finalization with real audio fixtures (requires ffmpeg + mkvmerge)", () => {
  it("merges 3 real ~4s WebM/Opus segments into ONE recording of ~12s with a real duration header", async (ctx) => {
    if (!ffmpegAvailable || !mkvmergeAvailable) {
      ctx.skip();
      return;
    }
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    for (let i = 0; i < 3; i += 1) {
      await saveAudioRecordingDraftSegment({
        draftId: draft.id,
        sessionId: `refresh-${i}`,
        bytes: fixtures[i],
        mimeType: "audio/webm",
        durationMs: 4000,
        final: true,
        rootDirectory: rootDir,
        repoGuid: REPO_A,
      });
    }

    const result = await finalizeAudioRecordingDraft({
      draftId: draft.id,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(result.durationMs).toBe(12000);
    expect(result.mimeType).toBe("audio/webm");

    // The final physical file must be ONE valid container whose measured
    // duration is ~12s — not a byte-concat that reports only ~4s.
    const finalPath = path.join(rootDir, result.fileName);
    const measured = await probeDurationSeconds(finalPath);
    if (measured === null) {
      // ffprobe is present in beforeAll gate, so this should not happen.
      throw new Error("ffprobe could not measure the final file");
    }
    expect(measured).toBeGreaterThan(11);
    expect(measured).toBeLessThan(13.5);

    // Draft is gone; exactly one saved recording exists for it.
    expect(
      await getAudioRecordingDraft(draft.id, { rootDirectory: rootDir, repoGuid: REPO_A }),
    ).toBeNull();
    const saved = await listAudioRecordings({ rootDirectory: rootDir, repoGuid: REPO_A });
    expect(saved.filter((r) => r.id === result.id)).toHaveLength(1);
  }, 60_000);

  it("REGRESSION: single-session recording (one segment) finalizes to a file with a real duration header", async (ctx) => {
    if (!ffmpegAvailable || !mkvmergeAvailable) {
      ctx.skip();
      return;
    }
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "only",
      bytes: fixtures[0],
      mimeType: "audio/webm",
      durationMs: 4000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    const result = await finalizeAudioRecordingDraft({
      draftId: draft.id,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    const measured = await probeDurationSeconds(path.join(rootDir, result.fileName));
    expect(measured).toBeGreaterThan(3.5);
    expect(measured).toBeLessThan(4.5);
  }, 60_000);

  it("double Save (concurrent + sequential retry) produces exactly one file", async (ctx) => {
    if (!ffmpegAvailable || !mkvmergeAvailable) {
      ctx.skip();
      return;
    }
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "s1",
      bytes: fixtures[0],
      mimeType: "audio/webm",
      durationMs: 4000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });

    const before = (await readdir(rootDir)).filter((f) => f.endsWith(".webm")).length;
    const [r1, r2] = await Promise.all([
      finalizeAudioRecordingDraft({ draftId: draft.id, rootDirectory: rootDir, repoGuid: REPO_A }),
      finalizeAudioRecordingDraft({ draftId: draft.id, rootDirectory: rootDir, repoGuid: REPO_A }),
    ]);
    expect(r1.id).toBe(r2.id);
    const after = (await readdir(rootDir)).filter((f) => f.endsWith(".webm")).length;
    expect(after - before).toBe(1);
  }, 60_000);

  it("failed finalization keeps the draft and its segments for retry", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    // Two NON-mergeable segments (mp3 cannot go into a WebM container) —
    // finalization must fail cleanly regardless of mkvmerge availability.
    for (const sessionId of ["a", "b"]) {
      await saveAudioRecordingDraftSegment({
        draftId: draft.id,
        sessionId,
        bytes: bytesOf("not-really-audio"),
        mimeType: "audio/mpeg",
        durationMs: 1000,
        final: true,
        rootDirectory: rootDir,
        repoGuid: REPO_A,
      });
    }
    await expect(
      finalizeAudioRecordingDraft({ draftId: draft.id, rootDirectory: rootDir, repoGuid: REPO_A }),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const after = await getAudioRecordingDraft(draft.id, {
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(after?.status).toBe("error");
    expect(after?.segments).toHaveLength(2);
    const info = await getAudioRecordingDraftSegmentReadInfo(draft.id, "a", {
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(info).toBeTruthy();
  });

  it("single-segment mp3 draft finalizes by direct copy (no merge tool needed)", async () => {
    const draft = await createAudioRecordingDraft({
      recordedDate: DATE,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    await saveAudioRecordingDraftSegment({
      draftId: draft.id,
      sessionId: "only",
      bytes: bytesOf("mp3-bytes"),
      mimeType: "audio/mpeg",
      durationMs: 1000,
      final: true,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    const result = await finalizeAudioRecordingDraft({
      draftId: draft.id,
      rootDirectory: rootDir,
      repoGuid: REPO_A,
    });
    expect(result.mimeType).toBe("audio/mpeg");
    const finalStat = await stat(path.join(rootDir, result.fileName));
    expect(finalStat.size).toBe("mp3-bytes".length);
  });
});
