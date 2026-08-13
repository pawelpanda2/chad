/**
 * Trivial leaf — see `../layout.tsx`'s own doc comment. `params` isn't
 * consumed here: the shared layout reads the current slug reactively from
 * `usePathname()` so it works identically for this route and the base
 * `/dashboard/folders` route without needing this leaf to pass anything
 * down.
 */
export default function FoldersSlugPage() {
  return null;
}
