"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MAX_BACK = 5;

interface DashboardHistoryValue {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
}

const DashboardHistoryContext = createContext<DashboardHistoryValue | null>(null);

/**
 * Tracks the dashboard's own visited-URL stack (`pathname` + `?form=`/`?view=`
 * search params — the existing source of truth for in-page navigation), so
 * `Back`/`Next` (see `nav-group.tsx`) can reliably know whether there's
 * anywhere to go, which the raw browser History API doesn't expose across
 * browsers.
 *
 * Deliberately the simplest thing that works: plain React state, in RAM
 * only — no `localStorage`/`sessionStorage`/backend. A page refresh clears
 * it for free (the provider remounts from scratch). Capped at 5 entries
 * back and 5 forward: every new (non-Back/Forward) navigation trims the
 * back portion of the stack to at most 5, which automatically caps the
 * forward portion too (it can only ever be repopulated by going Back
 * through those same 5 entries).
 */
export function DashboardHistoryProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

  const stateRef = useRef({ entries: [url], index: 0 });
  const [, setTick] = useState(0);

  useEffect(() => {
    const s = stateRef.current;
    if (s.entries[s.index] === url) return;

    if (s.entries[s.index - 1] === url) {
      // Matches the previous entry: a Back navigation (ours or the
      // browser's own back button).
      s.index -= 1;
    } else if (s.entries[s.index + 1] === url) {
      // Matches the next entry: a Forward navigation.
      s.index += 1;
    } else {
      // A genuinely new navigation from the current point — drop any
      // forward stack (standard browser semantics) and push the new URL.
      s.entries = [...s.entries.slice(0, s.index + 1), url];
      s.index = s.entries.length - 1;

      // Cap the back portion at MAX_BACK by dropping the oldest entries.
      const backCount = s.index;
      if (backCount > MAX_BACK) {
        const excess = backCount - MAX_BACK;
        s.entries = s.entries.slice(excess);
        s.index -= excess;
      }
    }
    setTick((t) => t + 1);
  }, [url]);

  const value = useMemo<DashboardHistoryValue>(() => {
    const s = stateRef.current;
    return {
      canGoBack: s.index > 0,
      canGoForward: s.index < s.entries.length - 1,
      goBack: () => {
        if (s.index > 0) router.push(s.entries[s.index - 1]);
      },
      goForward: () => {
        if (s.index < s.entries.length - 1) router.push(s.entries[s.index + 1]);
      },
    };
    // Re-derived whenever the URL changes (after the effect above updates
    // stateRef), via the `url` dependency below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, router]);

  return <DashboardHistoryContext.Provider value={value}>{children}</DashboardHistoryContext.Provider>;
}

export function useDashboardHistory(): DashboardHistoryValue {
  const ctx = useContext(DashboardHistoryContext);
  if (!ctx) {
    throw new Error("useDashboardHistory must be used within a DashboardHistoryProvider");
  }
  return ctx;
}
