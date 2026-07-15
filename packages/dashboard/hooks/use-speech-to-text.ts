"use client";

import { useCallback, useRef, useState } from "react";
import type { SpeechToTextEngine, SpeechToTextError } from "@/lib/speech/types";

export interface UseSpeechToTextResult {
  /** Whether the current engine can run at all in this browser. */
  isSupported: boolean;
  isRecording: boolean;
  /** Live transcript while recording; the final transcript once stopped. */
  transcript: string;
  error: SpeechToTextError | null;
  start: (lang?: string) => void;
  /** Stops recording and returns the final transcript text. */
  stop: () => Promise<string>;
  abort: () => void;
  /** Resets the transcript to "" without starting a new recording. */
  clear: () => void;
}

/**
 * Thin React binding over a `SpeechToTextEngine`. UI components must use
 * this hook (or the engine interface directly), never a concrete engine's
 * module — that's what keeps the UI swappable to a different engine later.
 */
export function useSpeechToText(engine: SpeechToTextEngine): UseSpeechToTextResult {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<SpeechToTextError | null>(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  // Text finalized across all completed Record/Stop cycles since the last
  // clear() — a second Record session builds on top of this instead of
  // discarding it, so stopping and recording again APPENDS rather than
  // replaces what was already dictated.
  const baseRef = useRef("");

  const start = useCallback((lang?: string) => {
    setError(null);
    setIsRecording(true);
    const base = baseRef.current;
    engineRef.current.start({
      lang,
      onPartialResult: (text) => setTranscript(base ? (text ? `${base} ${text}` : base) : text),
      onError: (err) => {
        setError(err);
        setIsRecording(false);
      },
    });
  }, []);

  const stop = useCallback(async () => {
    setIsRecording(false);
    const result = await engineRef.current.stop();
    const base = baseRef.current;
    const combined = base ? (result.text ? `${base} ${result.text}` : base) : result.text;
    baseRef.current = combined;
    setTranscript(combined);
    return combined;
  }, []);

  const abort = useCallback(() => {
    engineRef.current.abort();
    setIsRecording(false);
  }, []);

  const clear = useCallback(() => {
    baseRef.current = "";
    setTranscript("");
  }, []);

  return {
    isSupported: engineRef.current.isSupported(),
    isRecording,
    transcript,
    error,
    start,
    stop,
    abort,
    clear,
  };
}
