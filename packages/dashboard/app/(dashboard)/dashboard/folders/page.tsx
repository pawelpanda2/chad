/**
 * Trivial leaf — the entire Folders UI lives in `layout.tsx` now (see its
 * own doc comment for why: a `page.tsx` remounts on every `[slug]` change,
 * silently resetting local state that isn't derived from the URL). This
 * file exists only so `/dashboard/folders` is a routable path.
 */
export default function FoldersIndexPage() {
  return null;
}
