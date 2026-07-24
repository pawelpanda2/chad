/**
 * repo GUID -> storage backend routing.
 *
 * Default comes from `CP_DEFAULT_BACKEND` (net-adapter | files | mongo | postgre).
 * Optional per-repo overrides: `CP_REPO_BACKEND_OVERRIDES` as JSON object
 * `{ "<repoGuid>": "postgre" }` or comma pairs `guid:postgre,guid2:mongo`.
 */

export type CpBackendKind = "net-adapter" | "files" | "mongo" | "postgre";

const VALID: ReadonlySet<string> = new Set([
  "net-adapter",
  "files",
  "mongo",
  "postgre",
]);

function parseKind(raw: string | undefined, fallback: CpBackendKind): CpBackendKind {
  if (!raw || raw.trim() === "") return fallback;
  const kind = raw.trim().toLowerCase();
  if (!VALID.has(kind)) {
    throw new Error(
      `Unknown Content Provider backend "${raw}". Expected one of: ${[...VALID].join(", ")}`
    );
  }
  return kind as CpBackendKind;
}

function parseOverrides(): Record<string, CpBackendKind> {
  const raw = process.env.CP_REPO_BACKEND_OVERRIDES;
  if (!raw || raw.trim() === "") return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, string>;
    const out: Record<string, CpBackendKind> = {};
    for (const [guid, kind] of Object.entries(parsed)) {
      out[guid] = parseKind(kind, "net-adapter");
    }
    return out;
  }
  const out: Record<string, CpBackendKind> = {};
  for (const part of trimmed.split(",")) {
    const [guid, kind] = part.split(":").map((s) => s.trim());
    if (!guid || !kind) continue;
    out[guid] = parseKind(kind, "net-adapter");
  }
  return out;
}

/** Test/helper hook — clears nothing; reads env each call so tests can set env before invoke. */
export function getDefaultBackendKind(): CpBackendKind {
  return parseKind(process.env.CP_DEFAULT_BACKEND, "net-adapter");
}

export function getBackendKindForRepo(repoGuid: string): CpBackendKind {
  const overrides = parseOverrides();
  return overrides[repoGuid] ?? getDefaultBackendKind();
}
