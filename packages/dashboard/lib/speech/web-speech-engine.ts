import type { SpeechToTextEngine, SpeechToTextError } from "./types";

/**
 * First concrete `SpeechToTextEngine` implementation, backed by the
 * browser's Web Speech API (`SpeechRecognition`/`webkitSpeechRecognition`).
 *
 * Deliberately chosen as the first cut (see `documentation/stories/55/
 * 02_plan.md`): zero backend infrastructure, real-time partial results,
 * validates the report-by-voice UX cheaply before investing in a
 * Whisper-backed endpoint.
 *
 * Known, permanent limitations of THIS engine (not of the
 * `SpeechToTextEngine` abstraction as a whole):
 * - Only available in Chromium-family browsers (Chrome, Edge) at the time
 *   of writing — not Firefox, not Safari. `isSupported()` reflects this
 *   honestly; callers must treat an unsupported browser as a normal state,
 *   not an error.
 * - Audio is sent to the browser vendor's own cloud speech service (e.g.
 *   Google's, in Chrome) — outside this app's control.
 * - Browser-only: there is no equivalent API in a native mobile app. A
 *   future mobile adapter needs a different implementation of
 *   `SpeechToTextEngine` entirely (see `06_propositions.md`) — this engine
 *   is not, and is not presented as, a mobile solution.
 *
 * If accuracy/support/privacy tradeoffs prove unacceptable in real use,
 * add a second `SpeechToTextEngine` implementation backed by a Whisper
 * endpoint and swap it in at the call site — nothing outside this file
 * needs to change, by design.
 */

// Minimal ambient typing for the vendor-prefixed Web Speech API — not part
// of standard TS DOM lib. Deliberately kept narrow and local to this one
// file, which is the whole point of hiding it behind SpeechToTextEngine.
interface MinimalSpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

type SpeechRecognitionConstructor = new () => MinimalSpeechRecognition;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function mapErrorReason(error: string): SpeechToTextError["reason"] {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied";
    case "no-speech":
      return "no-speech";
    case "network":
      return "network";
    case "aborted":
      return "aborted";
    default:
      return "unknown";
  }
}

export function createWebSpeechEngine(): SpeechToTextEngine {
  let recognition: MinimalSpeechRecognition | null = null;
  let finalTranscript = "";
  let resolveStop: ((result: { text: string }) => void) | null = null;

  return {
    id: "web-speech",

    isSupported() {
      return getSpeechRecognitionConstructor() !== undefined;
    },

    start({ lang = "pl-PL", onPartialResult, onError }) {
      const Ctor = getSpeechRecognitionConstructor();
      if (!Ctor) {
        onError?.({
          reason: "not-supported",
          message:
            "Speech recognition is not available in this browser. Try Chrome or Edge.",
        });
        return;
      }

      finalTranscript = "";
      recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? "";
          if (result.isFinal) {
            finalTranscript += transcript + " ";
          } else {
            interim += transcript;
          }
        }
        onPartialResult?.((finalTranscript + interim).trim());
      };

      recognition.onerror = (event) => {
        onError?.({
          reason: mapErrorReason(event.error),
          message: `Speech recognition error: ${event.error}`,
        });
      };

      recognition.onend = () => {
        resolveStop?.({ text: finalTranscript.trim() });
        resolveStop = null;
      };

      recognition.start();
    },

    stop() {
      return new Promise((resolve) => {
        if (!recognition) {
          resolve({ text: finalTranscript.trim() });
          return;
        }
        resolveStop = resolve;
        recognition.stop();
      });
    },

    abort() {
      recognition?.abort();
      recognition = null;
      finalTranscript = "";
      resolveStop = null;
    },
  };
}
