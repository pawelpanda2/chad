import type { AudioRecordingError } from "dba";

/** Shared AudioRecordingError → HTTP status mapping for the draft routes. */
export function audioRecordingErrorStatus(error: AudioRecordingError): number {
  switch (error.code) {
    case "NOT_CONFIGURED":
    case "STORAGE_UNAVAILABLE":
      return 503;
    case "TOO_LARGE":
      return 413;
    case "WRITE_FAILED":
      return 500;
    default:
      return 400;
  }
}
