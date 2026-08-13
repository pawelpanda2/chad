/**
 * Pure state-transition logic for `dashboard-history-provider.tsx` (Story
 * 120), extracted so the trickiest part of the shared Back/Forward history
 * — telling a real Back/Forward apart from a fresh navigation that happens
 * to land on a URL already in the stack — is unit-tested directly, instead
 * of being another untested heuristic bolted onto a React effect.
 *
 * The previous implementation guessed Back/Forward purely from URL
 * equality against the neighboring stack entries. That misclassifies a
 * fresh `A → B → A` navigation (a real click/Link back to an earlier URL)
 * as a Back into the *existing* `A` entry, instead of recording a genuine
 * third visit. This version never guesses: the caller (the provider) tells
 * it, via `wasPopState`, whether the observed URL change came from a real
 * `popstate` event — the one signal the browser gives for "session history
 * actually moved" that `pushState`/`replaceState` never fire — and, via
 * `wasReplace`, whether the caller explicitly asked for the current entry
 * to be canonicalized in place (see `notifyReplace()` on the provider).
 */

export interface HistoryStackState {
  entries: string[];
  index: number;
}

export interface HistoryUrlChangeEvent {
  url: string;
  /** True when this URL change was observed via a native `popstate` event —
   * real session-history navigation, whether the browser's own Back/Forward
   * buttons or our own `goBack`/`goForward` (which delegate to
   * `router.back()`/`router.forward()` for exactly this reason). */
  wasPopState: boolean;
  /** True when the caller called `notifyReplace()` immediately before the
   * `router.replace(...)` that produced this URL — canonicalizes the
   * *current* entry in place instead of appending a new one. */
  wasReplace: boolean;
  /** Caps the back-portion of the stack. Defaults to {@link DEFAULT_MAX_BACK}. */
  maxBack?: number;
}

export const DEFAULT_MAX_BACK = 30;

export function initialHistoryStackState(url: string): HistoryStackState {
  return { entries: [url], index: 0 };
}

export function applyHistoryUrlChange(
  state: HistoryStackState,
  event: HistoryUrlChangeEvent,
): HistoryStackState {
  const { url, wasPopState, wasReplace } = event;
  const maxBack = event.maxBack ?? DEFAULT_MAX_BACK;

  // Duplicate/no-op: the tracked current entry already matches (e.g. a
  // mutation of the same item that never touched the URL at all wouldn't
  // even reach here, but a redundant push/replace to the same URL might).
  if (state.entries[state.index] === url) return state;

  if (wasPopState) {
    // Real back/forward through session history. Find the URL among our
    // own tracked neighbors and MOVE the index there — never push a new
    // entry for a Back/Forward. If it isn't adjacent (real browser history
    // reaches further than our capped window, e.g. after a page refresh
    // reset our in-RAM stack), resync to a fresh single-entry stack at the
    // observed URL rather than guessing a position.
    const prevIndex =
      state.index - 1 >= 0 && state.entries[state.index - 1] === url ? state.index - 1 : null;
    if (prevIndex !== null) return { ...state, index: prevIndex };

    const nextIndex =
      state.index + 1 < state.entries.length && state.entries[state.index + 1] === url
        ? state.index + 1
        : null;
    if (nextIndex !== null) return { ...state, index: nextIndex };

    return initialHistoryStackState(url);
  }

  if (wasReplace) {
    // Explicit, opt-in canonicalization of the CURRENT entry — never
    // appends, never changes index. Trusted unconditionally because only
    // this Story's own Folders base-route canonicalization calls it (see
    // dashboard-history-provider.tsx's doc comment) — every other
    // pre-existing `router.replace` call site in the dashboard doesn't use
    // this API and keeps behaving exactly as before.
    const entries = [...state.entries];
    entries[state.index] = url;
    return { ...state, entries };
  }

  // A genuinely new navigation (router.push, or a real <Link>/<a> click)
  // from the current point — drop any forward stack (standard browser
  // semantics) and push the new URL, even when it happens to equal an
  // existing stack entry's URL: A → B → A must record three entries, not
  // be mistaken for a Back into the earlier A.
  const truncated = state.entries.slice(0, state.index + 1);
  let entries = [...truncated, url];
  let index = entries.length - 1;

  const backCount = index;
  if (backCount > maxBack) {
    const excess = backCount - maxBack;
    entries = entries.slice(excess);
    index -= excess;
  }

  return { entries, index };
}
