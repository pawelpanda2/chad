/**
 * Engine-agnostic speech-to-text contract. UI code (components, hooks) must
 * only ever talk to this interface, never to a concrete engine (e.g. the
 * Web Speech API) directly — this is what lets the concrete engine be
 * swapped later (e.g. for a Whisper-backed adapter, or a native-mobile
 * adapter) without touching any UI.
 *
 * `isSupported()` must be checked before calling `start()` — an engine may
 * be entirely unavailable in the current browser/environment (e.g. Web
 * Speech API outside Chrome/Edge). An unsupported engine is a normal,
 * expected state to design for, not an error condition.
 */
export interface SpeechToTextEngine {
  /** Stable identifier for the engine, e.g. "web-speech". Useful for logging
   * and for showing engine-specific messaging (e.g. browser support notes). */
  readonly id: string;

  /** Whether this engine can run at all in the current environment. Check
   * this before rendering any recording UI for this engine. */
  isSupported(): boolean;

  /**
   * Begin capturing audio and recognizing speech.
   * @param options.lang BCP-47 language tag (e.g. "pl-PL"). Never hardcode
   *   a language inside an engine implementation — always take it here.
   * @param options.onPartialResult Called with the best-guess transcript
   *   so far, as the engine recognizes it (may fire multiple times before
   *   `stop()` resolves). Optional — engines that only support a single
   *   final result may never call this.
   * @param options.onError Called if recognition fails while recording is
   *   in progress (e.g. no microphone permission, network error for a
   *   cloud-backed engine). Recording is considered aborted after this.
   */
  start(options: {
    lang?: string;
    onPartialResult?: (text: string) => void;
    onError?: (error: SpeechToTextError) => void;
  }): void;

  /** Stop capturing and resolve with the final transcript. */
  stop(): Promise<{ text: string }>;

  /** Abort immediately, discarding any in-progress transcript. */
  abort(): void;
}

export type SpeechToTextErrorReason =
  | "not-supported"
  | "permission-denied"
  | "no-speech"
  | "network"
  | "aborted"
  | "unknown";

export interface SpeechToTextError {
  reason: SpeechToTextErrorReason;
  message: string;
}
