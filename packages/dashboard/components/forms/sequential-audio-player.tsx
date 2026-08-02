"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDurationClock } from "@/components/forms/audio-recording-utils";

export interface SequentialAudioTrack {
  id: string;
  src: string;
  /** Authoritative duration — MediaRecorder WebM often lacks a Duration header,
   *  so the native `<audio controls>` seek bar flashes as a volume slider until
   *  the browser guesses length. We drive the scrubber from this instead. */
  durationMs: number;
}

interface SequentialAudioPlayerProps {
  tracks: SequentialAudioTrack[];
  className?: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function locateTrack(
  tracks: SequentialAudioTrack[],
  positionMs: number,
): { index: number; offsetMs: number } {
  let remaining = Math.max(0, positionMs);
  for (let i = 0; i < tracks.length; i++) {
    const dur = Math.max(0, tracks[i].durationMs || 0);
    if (i === tracks.length - 1 || remaining < dur) {
      return { index: i, offsetMs: clamp(remaining, 0, dur) };
    }
    remaining -= dur;
  }
  return { index: Math.max(0, tracks.length - 1), offsetMs: 0 };
}

/**
 * Plays one or more audio URLs as a single continuous take: one play/pause
 * button and one time scrubber spanning the sum of known `durationMs` values.
 * Segments advance automatically (5s + 7s + 3s → 15s total). Never uses the
 * native `controls` attribute — that is what shows a volume slider first when
 * WebM metadata has no Duration header.
 */
export function SequentialAudioPlayer({ tracks, className }: SequentialAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackIndexRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const wallRef = useRef<{ wallStart: number; positionAtStart: number } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [trackIndex, setTrackIndex] = useState(0);

  const totalMs = useMemo(
    () => tracks.reduce((sum, t) => sum + Math.max(0, t.durationMs || 0), 0),
    [tracks],
  );

  const tracksKey = useMemo(() => tracks.map((t) => `${t.id}:${t.src}`).join("|"), [tracks]);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const completedBeforeMs = useCallback(
    (index: number) => {
      let sum = 0;
      for (let i = 0; i < index && i < tracks.length; i++) {
        sum += Math.max(0, tracks[i].durationMs || 0);
      }
      return sum;
    },
    [tracks],
  );

  const readPositionMs = useCallback(() => {
    const audio = audioRef.current;
    const index = trackIndexRef.current;
    const base = completedBeforeMs(index);
    if (!audio) return base;
    const t = audio.currentTime;
    if (Number.isFinite(t) && t >= 0) {
      return base + t * 1000;
    }
    const wall = wallRef.current;
    if (wall && playingRef.current) {
      return wall.positionAtStart + (performance.now() - wall.wallStart);
    }
    return base;
  }, [completedBeforeMs]);

  const tick = useCallback(() => {
    if (!playingRef.current) return;
    const next = clamp(readPositionMs(), 0, totalMs || 0);
    setPositionMs(next);
    rafRef.current = requestAnimationFrame(tick);
  }, [readPositionMs, totalMs]);

  const loadTrack = useCallback(
    async (index: number, offsetMs: number, autoplay: boolean) => {
      const audio = audioRef.current;
      const track = tracks[index];
      if (!audio || !track) return;

      trackIndexRef.current = index;
      setTrackIndex(index);

      const needsSrcChange = audio.dataset.trackId !== track.id || !audio.src;
      if (needsSrcChange) {
        audio.dataset.trackId = track.id;
        audio.src = track.src;
        audio.load();
      }

      const applyOffset = () => {
        const seconds = Math.max(0, offsetMs) / 1000;
        try {
          if (Number.isFinite(seconds)) audio.currentTime = seconds;
        } catch {
          /* some WebM blobs reject seeks until more is buffered */
        }
      };

      if (needsSrcChange || audio.readyState < 1) {
        await new Promise<void>((resolve) => {
          const onReady = () => {
            audio.removeEventListener("loadedmetadata", onReady);
            audio.removeEventListener("canplay", onReady);
            resolve();
          };
          audio.addEventListener("loadedmetadata", onReady);
          audio.addEventListener("canplay", onReady);
          // Safety: don't hang forever on broken streams.
          window.setTimeout(resolve, 1500);
        });
      }
      applyOffset();

      const absolute = completedBeforeMs(index) + offsetMs;
      setPositionMs(clamp(absolute, 0, totalMs || 0));
      wallRef.current = { wallStart: performance.now(), positionAtStart: absolute };

      if (autoplay) {
        try {
          await audio.play();
          playingRef.current = true;
          setPlaying(true);
          stopRaf();
          rafRef.current = requestAnimationFrame(tick);
        } catch {
          playingRef.current = false;
          setPlaying(false);
          stopRaf();
        }
      }
    },
    [tracks, completedBeforeMs, totalMs, stopRaf, tick],
  );

  const pause = useCallback(() => {
    const audio = audioRef.current;
    audio?.pause();
    playingRef.current = false;
    setPlaying(false);
    stopRaf();
    wallRef.current = null;
    setPositionMs(clamp(readPositionMs(), 0, totalMs || 0));
  }, [readPositionMs, stopRaf, totalMs]);

  const playFrom = useCallback(
    async (position: number) => {
      if (tracks.length === 0 || totalMs <= 0) return;
      const { index, offsetMs } = locateTrack(tracks, clamp(position, 0, totalMs));
      await loadTrack(index, offsetMs, true);
    },
    [tracks, totalMs, loadTrack],
  );

  const togglePlay = useCallback(() => {
    if (playingRef.current) {
      pause();
      return;
    }
    const atEnd = totalMs > 0 && positionMs >= totalMs - 40;
    void playFrom(atEnd ? 0 : positionMs);
  }, [pause, playFrom, positionMs, totalMs]);

  const onSeek = useCallback(
    (value: number) => {
      const next = clamp(value, 0, totalMs || 0);
      setPositionMs(next);
      if (playingRef.current) {
        void playFrom(next);
      } else {
        const { index, offsetMs } = locateTrack(tracks, next);
        void loadTrack(index, offsetMs, false);
      }
    },
    [totalMs, playFrom, tracks, loadTrack],
  );

  const onEnded = useCallback(() => {
    const nextIndex = trackIndexRef.current + 1;
    if (nextIndex < tracks.length) {
      void loadTrack(nextIndex, 0, true);
      return;
    }
    playingRef.current = false;
    setPlaying(false);
    stopRaf();
    wallRef.current = null;
    setPositionMs(totalMs);
  }, [tracks.length, loadTrack, stopRaf, totalMs]);

  // Reset when the track list identity changes (new segment uploaded, etc.).
  useEffect(() => {
    pause();
    setPositionMs(0);
    trackIndexRef.current = 0;
    setTrackIndex(0);
    const audio = audioRef.current;
    if (audio) {
      audio.removeAttribute("src");
      delete audio.dataset.trackId;
      audio.load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracksKey]);

  useEffect(() => {
    return () => {
      stopRaf();
      audioRef.current?.pause();
    };
  }, [stopRaf]);

  if (tracks.length === 0 || totalMs <= 0) {
    return null;
  }

  const label = `${formatDurationClock(positionMs) ?? "00:00"} / ${formatDurationClock(totalMs) ?? "00:00"}`;

  return (
    <div className={cn("flex w-full items-center gap-2", className)}>
      <audio ref={audioRef} preload="auto" onEnded={onEnded} className="hidden" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 w-8 shrink-0 p-0"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <input
        type="range"
        min={0}
        max={totalMs}
        step={50}
        value={clamp(positionMs, 0, totalMs)}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="h-1.5 w-full min-w-0 flex-1 cursor-pointer accent-foreground"
        aria-label="Seek"
        aria-valuetext={label}
      />
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{label}</span>
      {tracks.length > 1 && (
        <span className="sr-only">
          Playing segment {trackIndex + 1} of {tracks.length}
        </span>
      )}
    </div>
  );
}
