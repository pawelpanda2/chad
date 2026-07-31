/**
 * One recording session = ONE MediaRecorder instance driven through
 * pause()/resume() — never a new instance per resume. Raw byte-concat of
 * complete WebM containers (the old "Continue" implementation) produced a
 * file that reported only the first ~4s; chunks of a single paused/resumed
 * MediaRecorder stream ARE one container, so the single Blob built here is
 * valid.
 *
 * Framework-free and constructor-injected so the state machine (including
 * "pause time must not count as recording time") is unit-testable with a
 * fake recorder and a fake clock — no real microphone involved.
 */

export type RecorderSessionState = "recording" | "paused" | "stopped";

/** The subset of MediaRecorder this session drives (real or fake in tests). */
export interface MediaRecorderLike {
  state: "inactive" | "recording" | "paused";
  mimeType: string;
  start(timesliceMs?: number): void;
  stop(): void;
  pause(): void;
  resume(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface AudioRecorderSessionOptions {
  timesliceMs?: number;
  now?: () => number;
  /** Called for every non-empty chunk — the IndexedDB checkpoint hook. */
  onChunk?: (chunk: Blob) => void;
  onError?: (message: string) => void;
}

export class AudioRecorderSession {
  readonly sessionId: string;
  private readonly recorder: MediaRecorderLike;
  private readonly now: () => number;
  private readonly chunks: Blob[] = [];
  private activeMs = 0;
  private runningSince: number | null = null;
  private stopPromise: Promise<Blob> | null = null;
  private stopResolve: ((blob: Blob) => void) | null = null;

  constructor(
    recorder: MediaRecorderLike,
    sessionId: string,
    options: AudioRecorderSessionOptions = {},
  ) {
    this.recorder = recorder;
    this.sessionId = sessionId;
    this.now = options.now ?? (() => Date.now());
    const onChunk = options.onChunk;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
        onChunk?.(event.data);
      }
    };
    recorder.onerror = () => {
      options.onError?.("Recording failed.");
    };
    recorder.onstop = () => {
      if (this.runningSince !== null) {
        this.activeMs += this.now() - this.runningSince;
        this.runningSince = null;
      }
      this.stopResolve?.(this.buildBlob());
      this.stopResolve = null;
    };
    recorder.start(options.timesliceMs ?? 1000);
    this.runningSince = this.now();
  }

  get state(): RecorderSessionState {
    if (this.recorder.state === "recording") return "recording";
    if (this.recorder.state === "paused") return "paused";
    return "stopped";
  }

  get mimeType(): string {
    return this.recorder.mimeType;
  }

  /** Active recording time only — paused time never counts. */
  getActiveMs(): number {
    return this.activeMs + (this.runningSince !== null ? this.now() - this.runningSince : 0);
  }

  /** Everything captured so far as one (partial but self-consistent) stream. */
  buildBlob(): Blob {
    return new Blob(this.chunks, { type: this.recorder.mimeType || "audio/webm" });
  }

  /** No-op unless actually recording (multiple rapid Pause clicks are safe). */
  pause(): void {
    if (this.recorder.state !== "recording") return;
    this.recorder.pause();
    if (this.runningSince !== null) {
      this.activeMs += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  /** No-op unless actually paused — and NEVER creates a new recorder. */
  resume(): void {
    if (this.recorder.state !== "paused") return;
    this.recorder.resume();
    this.runningSince = this.now();
  }

  /** Resolves with the ONE final Blob of the whole session. Idempotent. */
  stop(): Promise<Blob> {
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = new Promise<Blob>((resolve) => {
      this.stopResolve = resolve;
      if (this.recorder.state === "inactive") {
        resolve(this.buildBlob());
        this.stopResolve = null;
        return;
      }
      try {
        this.recorder.stop();
      } catch {
        resolve(this.buildBlob());
        this.stopResolve = null;
      }
    });
    return this.stopPromise;
  }
}
