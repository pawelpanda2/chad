/**
 * Small SSR-safe `localStorage` wrapper — Story 120. Every failure mode
 * (server render with no `window`, private-mode storage disabled, quota
 * exceeded, disabled storage) degrades to a no-op/`null` instead of
 * throwing. Never the source of authorization for anything — callers must
 * treat every value read from here as untrusted input and re-validate it
 * normally (see `lib/cp-address/last-address-store.ts`).
 */

export function readLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Best-effort only (private mode, quota, disabled storage).
  }
}

export function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort only.
  }
}
