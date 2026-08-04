/**
 * Folder `Config.sorting` — optional, GUI-only ordering of a Folder's
 * direct children in the Folders page. Never affects CP indices/addresses,
 * Text items, or any other Folders list (history, repos, search, Copy).
 */

export type FolderSorting = "asc" | "desc";

/** Anything other than the literal "desc" (missing, wrong type, unknown string) safely falls back to "asc". */
export function resolveFolderSorting(value: unknown): FolderSorting {
  return value === "desc" ? "desc" : "asc";
}

export interface FolderChildEntry {
  index: string;
  name: string;
}

/**
 * Parses a Folder's Body (the CP index→name map) into an array, sorted
 * numerically by index per `sorting` (default "asc" — see
 * resolveFolderSorting). Does not mutate its input; returns `[]` for an
 * unparseable Body rather than throwing.
 */
export function parseFolderChildNameMap(body: string, sorting?: unknown): FolderChildEntry[] {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const direction = resolveFolderSorting(sorting);
      return Object.entries(parsed as Record<string, string>)
        .map(([index, name]) => ({ index, name }))
        .sort((a, b) =>
          direction === "desc" ? Number(b.index) - Number(a.index) : Number(a.index) - Number(b.index)
        );
    }
  } catch {
    // Falls through to [] — an unparseable Body shows no children rather than crashing the page.
  }
  return [];
}
