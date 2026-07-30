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

type Phase = "idle" | "recording" | "preview" | "saving" | "saved";

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

interface AudioRecordingFormProps {
  returnTo?: string;
}

export function AudioRecordingForm({
  returnTo = "/dashboard/views?view=recordings",
}: AudioRecordingFormProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [recordedDate, setRecordedDate] = useState(getLocalDateInputValue());
  const [namePart, setNamePart] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const savingLockRef = useRef(false);

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
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const releaseMic = useCallback(() => {
    stopTracks(streamRef.current);
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const discardBlob = useCallback(() => {
    blobRef.current = null;
    chunksRef.current = [];
    revokePreview();
    setElapsedMs(0);
    setResult(null);
  }, [revokePreview]);

  useEffect(() => {
    return () => {
      clearTimer();
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      releaseMic();
      revokePreview();
    };
  }, [clearTimer, releaseMic, revokePreview]);

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

    discardBlob();
    const mime = pickRecorderMime();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      setMimeType(recorder.mimeType || mime || "audio/webm");

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onerror = () => {
        setError("Recording failed.");
        clearTimer();
        releaseMic();
        setPhase("idle");
      };
      recorder.onstop = () => {
        clearTimer();
        releaseMic();
        const type = recorder.mimeType || mime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        blobRef.current = blob;
        if (blob.size === 0) {
          setError("Recording is empty.");
          setPhase("idle");
          discardBlob();
          return;
        }
        setPreviewUrl(URL.createObjectURL(blob));
        setMimeType(type);
        setPhase("preview");
      };

      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setPhase("recording");
      timerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
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

  const handleStop = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    try {
      recorder.stop();
    } catch {
      setError("Could not stop recording.");
      clearTimer();
      releaseMic();
      setPhase("idle");
    }
  };

  const handleDiscard = () => {
    if (phase === "recording") {
      handleStop();
      return;
    }
    discardBlob();
    setPhase("idle");
    setError(null);
  };

  const handleSave = async () => {
    if (savingLockRef.current || phase === "saving" || phase === "saved") return;
    const blob = blobRef.current;
    if (!blob || blob.size === 0) {
      setError("Nothing to save.");
      return;
    }
    if (!namePart.trim()) {
      setError("Recording name is required.");
      return;
    }

    savingLockRef.current = true;
    setPhase("saving");
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", blob, `recording.${mimeType.includes("ogg") ? "ogg" : "webm"}`);
      body.append("displayName", displayName);
      body.append("recordedDate", recordedDate);
      body.append("durationMs", String(elapsedMs));
      const res = await fetch("/api/forms/audio-recording", { method: "POST", body });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Save failed (${res.status})`);
      }
      setResult({ type: "success", message: `Saved as ${json.displayName ?? displayName}` });
      setPhase("saved");
      window.setTimeout(() => {
        router.push(returnTo);
      }, 800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setResult({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
      setPhase("preview");
    } finally {
      savingLockRef.current = false;
    }
  };

  const apiSupported =
    typeof window === "undefined" ||
    (typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);

  const fieldCell = "border bg-background px-2 py-1.5";
  const labelCell = "whitespace-nowrap border bg-background px-3 py-2 font-semibold";

  return (
    <div className={cn(FRAME_SECTION_SPACE_Y_CLASS, FRAME_SECTION_GAP_CLASS)}>
      <div
        className={cn(
          "flex max-w-[500px] flex-wrap items-center gap-3 rounded-lg border bg-muted/10",
          SAVE_FRAME_PADDING_CLASS,
        )}
      >
        <Button
          type="button"
          onClick={handleSave}
          disabled={phase !== "preview" || !namePart.trim() || !apiSupported}
        >
          {phase === "saving" ? "Saving..." : "Save"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(returnTo)}>
          Full View
        </Button>
        <Input
          value={displayName}
          readOnly
          tabIndex={-1}
          aria-label="Recording name"
          placeholder="Recording name"
          className="h-9 min-w-[160px] flex-1 bg-muted font-mono"
        />
        {result && (
          <span
            className={`flex items-center gap-1 text-sm ${
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
                  placeholder="e.g. trening-verbal-game"
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
          <Button type="button" onClick={handleRecord} disabled={!apiSupported}>
            Record
          </Button>
        )}
        {phase === "recording" && (
          <Button type="button" variant="destructive" onClick={handleStop}>
            Stop
          </Button>
        )}
        {(phase === "preview" || phase === "saved") && (
          <>
            <Button type="button" variant="outline" onClick={handleDiscard}>
              Discard
            </Button>
            <Button type="button" variant="outline" onClick={handleRecord}>
              Record again
            </Button>
          </>
        )}
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {formatDurationClock(elapsedMs) ?? "00:00"}
        </span>
      </div>

      {!apiSupported && (
        <p className="text-sm text-muted-foreground">
          Audio recording is not available in this browser.
        </p>
      )}

      {previewUrl && (
        <div className="max-w-[500px] rounded-lg border bg-muted/10 p-3">
          <audio controls src={previewUrl} className="w-full" />
        </div>
      )}
    </div>
  );
}
