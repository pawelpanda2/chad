"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBox } from "@/components/shared/error-box";
import {
  FRAME_SECTION_GAP_CLASS,
  FRAME_SECTION_SPACE_Y_CLASS,
  SAVE_FRAME_PADDING_CLASS,
} from "@/components/shared/layout-tokens";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  buildRecordingDisplayName,
  formatDurationClock,
  getLocalDateInputValue,
} from "@/components/forms/audio-recording-utils";
import {
  AudioRecorderSession,
  type MediaRecorderLike,
} from "@/components/forms/audio-recorder-session";
import {
  appendSessionChunk,
  assembleSessionBlob,
  clearSession,
  listPendingSessions,
} from "@/components/forms/audio-recording-draft-store";
import {
  SequentialAudioPlayer,
  type SequentialAudioTrack,
} from "@/components/forms/sequential-audio-player";

/**
 * Recording flow (Story 93 follow-up):
 * - ONE MediaRecorder per session, driven via pause()/resume() — see
 *   AudioRecorderSession. Stop yields ONE valid blob for the session.
 * - Every session is uploaded as a draft segment; final Save asks the
 *   backend to merge all segments into one file (mkvmerge remux — raw blob
 *   concat of complete containers is exactly the bug this replaces).
 * - Chunks are checkpointed to IndexedDB while recording, so a refresh
 *   mid-session can be recovered as a new segment of the same draft.
 */

type Phase = "idle" | "recording" | "paused" | "preview" | "saving" | "saved";

interface DraftSegmentInfo {
  sessionId: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  uploadedAt: string;
}

function pickRecorderMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t));
}

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      /* ignore */
    }
  }
}

async function apiJson(input: RequestInfo, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(input, init);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || json.success !== true) {
    throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status})`);
  }
  return json;
}

interface AudioRecordingFormProps {
  returnTo?: string;
  /** Continue an existing draft (from Views → Recordings → Continue). */
  initialDraftId?: string | null;
}

export function AudioRecordingForm({
  returnTo = "/dashboard/views?view=recordings",
  initialDraftId = null,
}: AudioRecordingFormProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordedDate, setRecordedDate] = useState(getLocalDateInputValue());
  const [namePart, setNamePart] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  /** Unsynced just-stopped take — shown in Latest take until it appears in draftSegments. */
  const [localPreview, setLocalPreview] = useState<{
    sessionId: string;
    url: string;
    durationMs: number;
  } | null>(null);
  const [draftSegments, setDraftSegments] = useState<DraftSegmentInfo[]>([]);
  const [draftId, setDraftId] = useState<string | null>(initialDraftId);

  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<AudioRecorderSession | null>(null);
  const sessionBlobRef = useRef<Blob | null>(null);
  const sessionSyncedRef = useRef(false);
  const draftIdRef = useRef<string | null>(initialDraftId);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const savingLockRef = useRef(false);
  const recoveryRanRef = useRef(false);

  const segmentsDurationMs = useMemo(
    () => draftSegments.reduce((sum, s) => sum + (s.durationMs || 0), 0),
    [draftSegments],
  );

  /** Chronological full take for "Latest take" — all saved segments, plus a
   *  just-stopped local blob until the server lists it. Total length = sum. */
  const latestTakeTracks = useMemo((): SequentialAudioTrack[] => {
    const tracks: SequentialAudioTrack[] = [];
    if (draftId) {
      for (const segment of draftSegments) {
        tracks.push({
          id: segment.sessionId,
          src: `/api/forms/audio-recording/drafts/${encodeURIComponent(draftId)}/segments/${encodeURIComponent(segment.sessionId)}/audio`,
          durationMs: segment.durationMs || 0,
        });
      }
    }
    if (
      localPreview &&
      localPreview.durationMs > 0 &&
      !draftSegments.some((s) => s.sessionId === localPreview.sessionId)
    ) {
      tracks.push({
        id: localPreview.sessionId,
        src: localPreview.url,
        durationMs: localPreview.durationMs,
      });
    }
    return tracks.filter((t) => t.durationMs > 0 && t.src);
  }, [draftId, draftSegments, localPreview]);

  /** Newest-first for the Saved segments list (display only). */
  const segmentsNewestFirst = useMemo(
    () =>
      draftSegments
        .map((segment, chronologicalIndex) => ({ segment, chronologicalIndex }))
        .reverse(),
    [draftSegments],
  );

  // Drop the local blob preview once the same session is on the server list.
  useEffect(() => {
    if (!localPreview) return;
    if (draftSegments.some((s) => s.sessionId === localPreview.sessionId)) {
      URL.revokeObjectURL(localPreview.url);
      setLocalPreview(null);
    }
  }, [draftSegments, localPreview]);

  const displayName = useMemo(
    () => buildRecordingDisplayName(recordedDate, namePart),
    [recordedDate, namePart],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revokePreview = useCallback(() => {
    setLocalPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const releaseMic = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
  }, []);

  const setDraft = useCallback((id: string | null) => {
    draftIdRef.current = id;
    setDraftId(id);
  }, []);

  // --------------------------------------------------------------------
  // Backend draft synchronization
  // --------------------------------------------------------------------

  const ensureDraft = useCallback(async (): Promise<string> => {
    if (draftIdRef.current) return draftIdRef.current;
    const json = await apiJson("/api/forms/audio-recording/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordedDate }),
    });
    const draft = json.draft as { id: string };
    setDraft(draft.id);
    return draft.id;
  }, [recordedDate, setDraft]);

  const refreshDraftDetail = useCallback(async (id: string) => {
    try {
      const json = await apiJson(`/api/forms/audio-recording/drafts/${encodeURIComponent(id)}`);
      const draft = json.draft as { segments: DraftSegmentInfo[] };
      setDraftSegments(draft.segments ?? []);
    } catch {
      // Detail refresh is cosmetic; keep whatever we have.
    }
  }, []);

  const uploadSessionBlob = useCallback(
    async (id: string, sessionId: string, blob: Blob, activeMs: number, final: boolean) => {
      const body = new FormData();
      const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm";
      body.append("file", blob, `segment.${ext}`);
      body.append("durationMs", String(Math.max(0, Math.round(activeMs))));
      body.append("final", final ? "true" : "false");
      await apiJson(
        `/api/forms/audio-recording/drafts/${encodeURIComponent(id)}/segments/${encodeURIComponent(sessionId)}`,
        { method: "PUT", body },
      );
    },
    [],
  );

  // Uploads for one session are strictly serialized — a slow provisional
  // checkpoint (Pause) must never land AFTER the session's final upload and
  // overwrite it with partial bytes.
  const syncChainRef = useRef<Promise<boolean>>(Promise.resolve(false));

  /** Checkpoint / final sync of the current session to the backend draft. */
  const syncCurrentSession = useCallback(
    (final: boolean): Promise<boolean> => {
      const session = sessionRef.current;
      const blob = final ? sessionBlobRef.current : session?.buildBlob() ?? null;
      const activeMs = session?.getActiveMs() ?? 0;
      if (!session || !blob || blob.size === 0) return Promise.resolve(false);
      const run = async (): Promise<boolean> => {
        try {
          const id = await ensureDraft();
          await uploadSessionBlob(id, session.sessionId, blob, activeMs, final);
          setSyncWarning(null);
          if (final) {
            sessionSyncedRef.current = true;
            await clearSession(id, session.sessionId);
            await refreshDraftDetail(id);
          }
          return true;
        } catch (err) {
          setSyncWarning(
            `Could not sync to server (${err instanceof Error ? err.message : "error"}) — kept locally, will retry on Save.`,
          );
          return false;
        }
      };
      const next = syncChainRef.current.then(run, run);
      syncChainRef.current = next;
      return next;
    },
    [ensureDraft, uploadSessionBlob, refreshDraftDetail],
  );

  // --------------------------------------------------------------------
  // Recovery: existing draft (Continue) + IndexedDB leftovers after refresh
  // --------------------------------------------------------------------

  useEffect(() => {
    if (recoveryRanRef.current) return;
    recoveryRanRef.current = true;
    let cancelled = false;

    (async () => {
      let activeDraftId = initialDraftId;
      let recoveredSegments = 0;

      // 1) Leftover chunks in IndexedDB = a session interrupted by refresh.
      //    A session checkpointed under a real backend draft id goes back to
      //    THAT draft; "local-" sessions (draft creation never succeeded)
      //    are attached to the draft being continued, or to a new one.
      try {
        const pending = await listPendingSessions();
        for (const meta of pending) {
          const isLocalOnly = meta.draftId.startsWith("local-");
          if (initialDraftId && !isLocalOnly && meta.draftId !== initialDraftId) {
            // Belongs to a different draft — leave it for that draft's visit.
            continue;
          }
          const assembled = await assembleSessionBlob(meta.draftId, meta.sessionId);
          if (!assembled) {
            await clearSession(meta.draftId, meta.sessionId);
            continue;
          }
          try {
            let targetDraftId: string;
            if (!isLocalOnly) {
              targetDraftId = meta.draftId;
            } else if (activeDraftId) {
              targetDraftId = activeDraftId;
            } else {
              const json = await apiJson("/api/forms/audio-recording/drafts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recordedDate: getLocalDateInputValue() }),
              });
              targetDraftId = (json.draft as { id: string }).id;
            }
            await uploadSessionBlob(
              targetDraftId,
              meta.sessionId,
              assembled.blob,
              assembled.meta.activeMs,
              true,
            );
            await clearSession(meta.draftId, meta.sessionId);
            recoveredSegments += 1;
            if (!activeDraftId) activeDraftId = targetDraftId;
          } catch {
            // Backend unreachable — keep the local chunks for the next visit.
          }
        }
      } catch {
        // IndexedDB unavailable — nothing to recover locally.
      }

      if (cancelled) return;

      // 2) Load the draft's saved segments (Continue flow and/or recovery).
      if (activeDraftId) {
        setDraft(activeDraftId);
        try {
          const json = await apiJson(
            `/api/forms/audio-recording/drafts/${encodeURIComponent(activeDraftId)}`,
          );
          const draft = json.draft as {
            segments: DraftSegmentInfo[];
            recordedDate: string;
            displayName: string;
            status: string;
            error: string | null;
          };
          if (cancelled) return;
          setDraftSegments(draft.segments ?? []);
          if (draft.recordedDate) setRecordedDate(draft.recordedDate);
          if (draft.status === "error" && draft.error) {
            setError(`Previous save attempt failed: ${draft.error}`);
          }
          if ((draft.segments ?? []).length > 0) {
            setPhase("preview");
            setNotice(
              recoveredSegments > 0
                ? `Recovered draft · ${draft.segments.length} saved segment${draft.segments.length === 1 ? "" : "s"}`
                : `Draft · ${draft.segments.length} saved segment${draft.segments.length === 1 ? "" : "s"}`,
            );
          }
        } catch {
          if (!cancelled) {
            setError("Could not load the draft from the server.");
          }
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Recovery runs exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn (secondary protection only) when leaving mid-recording.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (phase === "recording" || phase === "paused") {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [phase]);

  useEffect(() => {
    return () => {
      clearTimer();
      const session = sessionRef.current;
      if (session && session.state !== "stopped") {
        void session.stop();
      }
      releaseMic();
      revokePreview();
    };
  }, [clearTimer, releaseMic, revokePreview]);

  // --------------------------------------------------------------------
  // Recording controls
  // --------------------------------------------------------------------

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setInterval(() => {
      setElapsedMs(segmentsDurationMs + (sessionRef.current?.getActiveMs() ?? 0));
    }, 200);
  }, [clearTimer, segmentsDurationMs]);

  const handleRecord = async () => {
    setError(null);
    setResult(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access the microphone.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("MediaRecorder is not supported in this browser.");
      return;
    }
    // Never silently drop the previous take: if its final upload has not
    // reached the server yet, retry now and refuse to start a new segment
    // on failure — otherwise Save would finalize WITHOUT that material.
    if (sessionBlobRef.current && sessionBlobRef.current.size > 0 && !sessionSyncedRef.current) {
      const ok = await syncCurrentSession(true);
      if (!ok) {
        setError("The previous take is not uploaded yet — check the connection and try again.");
        return;
      }
    }
    revokePreview();
    sessionBlobRef.current = null;
    sessionSyncedRef.current = false;

    const mime = pickRecorderMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const sessionId = crypto.randomUUID();
      // Chunks are checkpointed under a local pseudo-draft until the backend
      // draft exists; recovery maps it to a real draft.
      const localKeyDraft = () => draftIdRef.current ?? `local-${sessionId}`;
      const sessionHolder: { current: AudioRecorderSession | null } = { current: null };
      // Safe: BlobEvent satisfies the { data: Blob } the session reads; the
      // narrower interface exists so tests can drive a fake recorder.
      const session = new AudioRecorderSession(recorder as unknown as MediaRecorderLike, sessionId, {
        timesliceMs: 1000,
        onChunk: (chunk) => {
          void appendSessionChunk(
            localKeyDraft(),
            sessionId,
            chunk,
            recorder.mimeType || mime || "audio/webm",
            sessionHolder.current?.getActiveMs() ?? 0,
          );
        },
        onError: (message) => {
          setError(message);
          clearTimer();
          releaseMic();
          setPhase("idle");
        },
      });
      sessionHolder.current = session;
      sessionRef.current = session;
      setPhase("recording");
      startTimer();
      // Create the backend draft in the background — recording must not
      // block on the server; failures degrade to local-only + warning.
      void ensureDraft().catch(() => {
        setSyncWarning("Server draft could not be created yet — recording locally, will retry.");
      });
    } catch (err) {
      releaseMic();
      const name = err instanceof DOMException ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setError("Microphone access was denied.");
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setError("No microphone was found.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start recording.");
      }
      setPhase("idle");
    }
  };

  const handlePause = () => {
    const session = sessionRef.current;
    if (!session || session.state !== "recording") return;
    session.pause();
    setElapsedMs(segmentsDurationMs + session.getActiveMs());
    setPhase("paused");
    // Requirement: sync the draft after Pause (mid-session checkpoint).
    void syncCurrentSession(false);
  };

  const handleResume = () => {
    const session = sessionRef.current;
    if (!session || session.state !== "paused") return;
    session.resume();
    setPhase("recording");
    startTimer();
  };

  const handleStop = async () => {
    const session = sessionRef.current;
    if (!session) return;
    clearTimer();
    const blob = await session.stop();
    releaseMic();
    const activeMs = session.getActiveMs();
    setElapsedMs(segmentsDurationMs + activeMs);
    if (blob.size === 0) {
      sessionRef.current = null;
      if (draftSegments.length > 0) {
        setPhase("preview");
      } else {
        setError("Recording is empty.");
        setPhase("idle");
      }
      return;
    }
    sessionBlobRef.current = blob;
    setLocalPreview({
      sessionId: session.sessionId,
      url: URL.createObjectURL(blob),
      durationMs: activeMs,
    });
    setPhase("preview");
    // Final upload of this session's segment (replaces its checkpoint).
    void syncCurrentSession(true);
  };

  const resetAllLocal = useCallback(() => {
    sessionRef.current = null;
    sessionBlobRef.current = null;
    sessionSyncedRef.current = false;
    setDraftSegments([]);
    setNotice(null);
    setSyncWarning(null);
    revokePreview();
    setElapsedMs(0);
    setResult(null);
  }, [revokePreview]);

  const handleDiscard = async () => {
    if (phase === "recording" || phase === "paused") {
      clearTimer();
      const session = sessionRef.current;
      if (session) {
        await session.stop();
        void clearSession(draftIdRef.current ?? `local-${session.sessionId}`, session.sessionId);
      }
      releaseMic();
    }
    const id = draftIdRef.current;
    if (id) {
      try {
        await fetch(`/api/forms/audio-recording/drafts/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
      } catch {
        // Draft stays on the server (visible in Views → Recordings) — that
        // is safer than pretending it was removed.
      }
      setDraft(null);
    }
    resetAllLocal();
    setPhase("idle");
    setError(null);
  };

  const handleSave = async () => {
    if (savingLockRef.current || phase === "saving" || phase === "saved") return;
    savingLockRef.current = true;
    setPhase("saving");
    setError(null);
    setResult(null);
    try {
      const session = sessionRef.current;
      const hasCurrentBlob = !!sessionBlobRef.current && sessionBlobRef.current.size > 0;
      if (!hasCurrentBlob && draftSegments.length === 0) {
        throw new Error("Nothing to save.");
      }
      // Retry the final segment upload if it has not reached the server yet.
      if (hasCurrentBlob && !sessionSyncedRef.current && session) {
        const ok = await syncCurrentSession(true);
        if (!ok) {
          throw new Error("Could not upload the recording to the server.");
        }
      }
      const id = draftIdRef.current;
      if (!id) {
        throw new Error("Nothing to save.");
      }
      const json = await apiJson(
        `/api/forms/audio-recording/drafts/${encodeURIComponent(id)}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName }),
        },
      );
      // Local checkpoints for this draft are no longer needed.
      const pending = await listPendingSessions().catch(() => []);
      for (const meta of pending) {
        if (meta.draftId === id) await clearSession(meta.draftId, meta.sessionId);
      }
      setResult({
        type: "success",
        message: `Saved as ${typeof json.displayName === "string" ? json.displayName : displayName}`,
      });
      setDraft(null);
      setPhase("saved");
      window.setTimeout(() => {
        router.push(returnTo);
      }, 800);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      setResult({ type: "error", message });
      setPhase(draftSegments.length > 0 || sessionBlobRef.current ? "preview" : "idle");
    } finally {
      savingLockRef.current = false;
    }
  };

  const apiSupported =
    typeof window === "undefined" ||
    (typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);

  const fieldCell = "border bg-background px-2 py-1.5";
  const labelCell = "whitespace-nowrap border bg-background px-3 py-2 font-semibold";

  const isBusyRecording = phase === "recording" || phase === "paused";

  return (
    <div className={cn(FRAME_SECTION_SPACE_Y_CLASS, FRAME_SECTION_GAP_CLASS)}>
      <div
        className={cn(
          "flex w-fit flex-nowrap items-center gap-3 rounded-lg border bg-muted/10",
          SAVE_FRAME_PADDING_CLASS,
        )}
      >
        <Button
          type="button"
          className="shrink-0"
          onClick={() => void handleSave()}
          disabled={phase === "saving" || isBusyRecording || !apiSupported}
        >
          {phase === "saving" ? "Saving..." : "Save"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          onClick={() => router.push(returnTo)}
        >
          Full View
        </Button>
        <Input
          value={displayName}
          readOnly
          tabIndex={-1}
          aria-label="Recording name"
          placeholder="Recording name"
          className="h-9 w-[260px] shrink-0 bg-muted font-mono"
        />
        {result && (
          <span
            className={`flex shrink-0 items-center gap-1 whitespace-nowrap text-sm ${
              result.type === "success" ? "text-green-600" : "text-red-600"
            }`}
          >
            {result.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
            )}
            {result.message}
          </span>
        )}
      </div>

      <ErrorBox message={error} />
      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {syncWarning && <p className="text-sm text-amber-600">{syncWarning}</p>}

      <div className="max-w-[460px] rounded-lg border bg-muted/10 p-2">
        <table className="w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className={labelCell}>Date</td>
              <td className={fieldCell}>
                <Input
                  type="date"
                  value={recordedDate}
                  onChange={(e) => setRecordedDate(e.target.value)}
                  disabled={isBusyRecording || !!draftId}
                  className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />
              </td>
            </tr>
            <tr>
              <td className={labelCell}>Name</td>
              <td className={fieldCell}>
                <Input
                  value={namePart}
                  onChange={(e) => setNamePart(e.target.value)}
                  placeholder="optional, e.g. trening-verbal-game"
                  className="h-8 border-0 bg-transparent shadow-none focus-visible:ring-1"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        className={cn(
          "flex max-w-[500px] flex-wrap items-center gap-3 rounded-lg border bg-muted/10",
          SAVE_FRAME_PADDING_CLASS,
        )}
      >
        {(phase === "idle" || phase === "saved") && (
          <Button type="button" onClick={() => void handleRecord()} disabled={!apiSupported}>
            Record
          </Button>
        )}
        {phase === "recording" && (
          <>
            <Button type="button" variant="outline" onClick={handlePause}>
              Pause
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleStop()}>
              Stop
            </Button>
          </>
        )}
        {phase === "paused" && (
          <>
            <Button type="button" onClick={handleResume}>
              Resume
            </Button>
            <Button type="button" variant="destructive" onClick={() => void handleStop()}>
              Stop
            </Button>
          </>
        )}
        {phase === "preview" && (
          <>
            <Button type="button" variant="outline" onClick={() => void handleDiscard()}>
              Discard
            </Button>
            <Button type="button" variant="outline" onClick={() => void handleRecord()}>
              Record next segment
            </Button>
          </>
        )}
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatDurationClock(elapsedMs) ?? "00:00"}
        </span>
        {phase === "recording" && <span className="text-sm text-red-600">● recording</span>}
        {phase === "paused" && <span className="text-sm text-amber-600">‖ paused</span>}
      </div>

      {!apiSupported && (
        <p className="text-sm text-muted-foreground">
          Audio recording is not available in this browser.
        </p>
      )}

      {latestTakeTracks.length > 0 && phase !== "recording" && phase !== "paused" && (
        <div className="max-w-[500px] rounded-lg border bg-muted/10 p-3">
          <p className="mb-1 text-xs text-muted-foreground">
            Latest take
            {latestTakeTracks.length > 1
              ? ` · ${latestTakeTracks.length} segments · ${formatDurationClock(
                  latestTakeTracks.reduce((s, t) => s + t.durationMs, 0),
                )}`
              : ""}
          </p>
          <SequentialAudioPlayer tracks={latestTakeTracks} />
        </div>
      )}

      {draftId && draftSegments.length > 0 && phase !== "recording" && phase !== "paused" && (
        <div className="max-w-[500px] space-y-2 rounded-lg border bg-muted/10 p-3">
          <p className="text-xs text-muted-foreground">
            Saved segments ({draftSegments.length})
          </p>
          {segmentsNewestFirst.map(({ segment, chronologicalIndex }) => (
            <div key={segment.sessionId} className="flex items-center gap-2">
              <span className="w-24 flex-shrink-0 font-mono text-xs text-muted-foreground">
                {chronologicalIndex + 1} · {formatDurationClock(segment.durationMs) ?? "?"}
              </span>
              <SequentialAudioPlayer
                tracks={[
                  {
                    id: segment.sessionId,
                    src: `/api/forms/audio-recording/drafts/${encodeURIComponent(draftId)}/segments/${encodeURIComponent(segment.sessionId)}/audio`,
                    durationMs: segment.durationMs || 0,
                  },
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
