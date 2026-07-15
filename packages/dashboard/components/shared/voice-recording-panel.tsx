"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, ArrowRightToLine, Loader2 } from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { createWebSpeechEngine } from "@/lib/speech/web-speech-engine";
import { cn } from "@/lib/utils";

export interface VoiceRecordingPanelProps {
  /** Whether the report this panel is attached to already exists (has a
   * loca) — Move requires this; Record does not (dictation can happen
   * before Create). */
  reportCreated: boolean;
  /** The host form's own save-in-progress flag (shared with its Save
   * button), so Move can't race a manual Save. */
  saving: boolean;
  /** Called with the current transcript when Move is clicked. Must return
   * whether the save succeeded — the panel only clears the transcript on
   * `true`, and leaves it untouched (with the caller's own error already
   * shown) on `false`. */
  onMove: (text: string) => Promise<boolean>;
  /** BCP-47 language tag for recognition. Defaults to Polish. */
  lang?: string;
  className?: string;
}

/**
 * Standalone recording frame for the Reports form: Record/Move buttons plus
 * the live/final transcript, always visible between the metadata frame and
 * the editor. Grows with the transcript's length (no small fixed height),
 * but caps internal growth so it can never push the page into a global
 * scroll — see `documentation/dashboard/common/features/voice-recording.md`.
 *
 * Still talks only to `SpeechToTextEngine` via `useSpeechToText` — never to
 * the Web Speech API directly (same swappable-engine boundary as
 * `VoiceRecordButton`).
 */
export function VoiceRecordingPanel({ reportCreated, saving, onMove, lang = "pl-PL", className }: VoiceRecordingPanelProps) {
  const engine = useMemo(() => createWebSpeechEngine(), []);
  const { isSupported, isRecording, transcript, error, start, stop, clear } = useSpeechToText(engine);
  const [moving, setMoving] = useState(false);

  if (!isSupported) {
    return (
      <div
        className={cn("shrink-0 rounded-xl border bg-card shadow-sm p-[10px] text-xs text-muted-foreground", className)}
        title="Voice recording currently needs a Chromium-based browser (Chrome or Edge)."
      >
        Voice recording isn&apos;t available in this browser (needs Chrome or Edge)
      </div>
    );
  }

  async function handleRecordClick() {
    if (isRecording) {
      await stop();
    } else {
      start(lang);
    }
  }

  async function handleMoveClick() {
    if (!transcript.trim()) return;
    setMoving(true);
    try {
      const ok = await onMove(transcript);
      if (ok) clear();
    } finally {
      setMoving(false);
    }
  }

  const moveDisabled = !reportCreated || !transcript.trim() || saving || moving;

  return (
    <div className={cn("shrink-0 rounded-xl border bg-card shadow-sm p-[10px]", className)}>
      <div className="flex items-start gap-2">
        {/* Record stacked above Move (not side by side) — a narrower button
            column leaves more horizontal room for the transcript text. */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <Button
            type="button"
            onClick={handleRecordClick}
            variant={isRecording ? "default" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
          >
            {isRecording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {isRecording ? "Stop" : "Record"}
          </Button>
          <Button
            type="button"
            onClick={handleMoveClick}
            disabled={moveDisabled}
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
          >
            {moving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightToLine className="h-3.5 w-3.5" />}
            Move
          </Button>
        </div>
        <div className="min-w-0 flex-1 max-h-[35vh] overflow-y-auto">
          {transcript ? (
            <p className="whitespace-pre-wrap break-words text-sm">{transcript}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isRecording ? "Listening..." : "No transcript yet. Click Record to dictate."}
            </p>
          )}
        </div>
      </div>
      {error && <p className="mt-1.5 text-xs text-destructive">{error.message}</p>}
    </div>
  );
}
