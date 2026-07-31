/**
 * AudioRecorderSession state machine — regression tests for the reported
 * bug (Record 4s → Pause → Resume → 4s → Pause → Resume → 4s → Stop must be
 * ONE recorder instance, ONE blob, ~12s active time — pauses excluded).
 *
 * Uses a fake MediaRecorder + fake clock: this protects the UI/state logic;
 * the real container format and merging are covered separately by
 * packages/dba/src/audio-recording-drafts.test.ts on real audio fixtures.
 */

import { describe, expect, it } from "vitest";
import { AudioRecorderSession, type MediaRecorderLike } from "./audio-recorder-session";

class FakeClock {
  private ms = 0;
  now = () => this.ms;
  advance(byMs: number) {
    this.ms += byMs;
  }
}

class FakeMediaRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  startCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  start() {
    this.startCalls += 1;
    this.state = "recording";
  }
  pause() {
    this.pauseCalls += 1;
    this.state = "paused";
  }
  resume() {
    this.resumeCalls += 1;
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
  emitChunk(bytes: number) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
  }
}

function makeSession() {
  const clock = new FakeClock();
  const recorder = new FakeMediaRecorder();
  const chunks: Blob[] = [];
  const session = new AudioRecorderSession(recorder, "test-session", {
    now: clock.now,
    onChunk: (c) => chunks.push(c),
  });
  return { clock, recorder, session, chunks };
}

describe("REGRESSION: 4s + pause + 4s + pause + 4s = one recorder, one blob, ~12s", () => {
  it("keeps a single MediaRecorder instance across pause/resume and excludes paused time", async () => {
    const { clock, recorder, session } = makeSession();
    expect(recorder.startCalls).toBe(1);

    clock.advance(4000);
    recorder.emitChunk(100);
    session.pause();
    clock.advance(60_000); // long pause — must NOT count

    session.resume();
    clock.advance(4000);
    recorder.emitChunk(100);
    session.pause();
    clock.advance(30_000); // another pause — must NOT count

    session.resume();
    clock.advance(4000);
    recorder.emitChunk(100);

    const blob = await session.stop();

    // One instance, driven via pause()/resume() — never re-created.
    expect(recorder.startCalls).toBe(1);
    expect(recorder.pauseCalls).toBe(2);
    expect(recorder.resumeCalls).toBe(2);

    // Active time is exactly the 3 × 4s of recording, not 12s + 90s pauses.
    expect(session.getActiveMs()).toBe(12_000);

    // ONE blob containing every chunk of the whole session.
    expect(blob.size).toBe(300);
    expect(session.state).toBe("stopped");
  });
});

describe("edge cases", () => {
  it("pause when not recording is a no-op", () => {
    const { recorder, session } = makeSession();
    recorder.state = "paused";
    session.pause();
    expect(recorder.pauseCalls).toBe(0);
  });

  it("resume when not paused is a no-op (no duplication)", () => {
    const { recorder, session } = makeSession();
    session.resume(); // recording, not paused
    expect(recorder.resumeCalls).toBe(0);
  });

  it("rapid pause/resume/pause/resume keeps time consistent", () => {
    const { clock, session, recorder } = makeSession();
    clock.advance(1000);
    session.pause();
    session.pause(); // double click
    session.resume();
    session.resume(); // double click
    clock.advance(1000);
    expect(recorder.pauseCalls).toBe(1);
    expect(recorder.resumeCalls).toBe(1);
    expect(session.getActiveMs()).toBe(2000);
  });

  it("stop while paused resolves with the collected blob and final time", async () => {
    const { clock, recorder, session } = makeSession();
    clock.advance(3000);
    recorder.emitChunk(50);
    session.pause();
    clock.advance(10_000);
    const blob = await session.stop();
    expect(blob.size).toBe(50);
    expect(session.getActiveMs()).toBe(3000);
  });

  it("stop is idempotent — second call returns the same promise/blob", async () => {
    const { clock, recorder, session } = makeSession();
    clock.advance(1000);
    recorder.emitChunk(10);
    const p1 = session.stop();
    const p2 = session.stop();
    expect(p1).toBe(p2);
    expect((await p1).size).toBe(10);
  });

  it("timer keeps counting while recording (between chunks)", () => {
    const { clock, session } = makeSession();
    clock.advance(2500);
    expect(session.getActiveMs()).toBe(2500);
  });
});
