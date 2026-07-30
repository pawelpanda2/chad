export function getLocalDateInputValue(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export function buildRecordingDisplayName(recordedDate: string, namePart: string): string {
  const suffix = namePart.trim().replace(/\s+/g, "-");
  return suffix ? `${recordedDate}_${suffix}` : recordedDate;
}

export function formatDurationClock(durationMs?: number): string | null {
  if (!durationMs || durationMs < 0) return null;
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
