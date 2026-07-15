"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { createWebSpeechEngine } from "@/lib/speech/web-speech-engine";
import { cn } from "@/lib/utils";

export interface VoiceRecordButtonProps {
  /** Called with the final transcript once recording stops. Caller decides
   * whether to append/replace existing content. */
  onTranscript: (text: string) => void;
  /** BCP-47 language tag for recognition. Defaults to Polish. */
  lang?: string;
  className?: string;
}

/**
 * Reusable voice-recording control, backed by `SpeechToTextEngine` (see
 * `lib/speech/types.ts`) via the `useSpeechToText` hook — never talks to
 * the Web Speech API directly itself. Not specific to any one form; wire
 * it into any editor's `toolbarExtra` slot the same way Reports does.
 *
 * An unsupported browser is rendered as a plain, non-error explanatory
 * note (never a red error state) — Web Speech API is Chrome/Edge-only at
 * the time of writing, which is an expected, permanent limitation of this
 * first engine, not a bug.
 */
export function VoiceRecordButton({ onTranscript, lang = "pl-PL", className }: VoiceRecordButtonProps) {
  const engine = useMemo(() => createWebSpeechEngine(), []);
  const { isSupported, isRecording, transcript, error, start, stop } = useSpeechToText(engine);

  if (!isSupported) {
    return (
      <span
        className={cn("shrink-0 text-xs text-muted-foreground", className)}
        title="Voice recording currently needs a Chromium-based browser (Chrome or Edge)."
      >
        Voice recording isn&apos;t available in this browser (needs Chrome or Edge)
      </span>
    );
  }

  async function handleClick() {
    if (isRecording) {
      const text = await stop();
      if (text) onTranscript(text);
    } else {
      start(lang);
    }
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Button
        type="button"
        onClick={handleClick}
        variant={isRecording ? "default" : "outline"}
        size="sm"
        className="h-8 shrink-0 gap-1.5"
      >
        {isRecording ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        {isRecording ? "Stop" : "Record"}
      </Button>
      {isRecording && transcript && (
        <span className="max-w-[280px] truncate text-xs text-muted-foreground" title={transcript}>
          {transcript}
        </span>
      )}
      {error && <span className="shrink-0 text-xs text-destructive">{error.message}</span>}
    </div>
  );
}
