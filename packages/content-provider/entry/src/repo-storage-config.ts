/**
 * repo GUID -> storage backend routing.
 *
 * Stage 1 only has cp-net-adapter — cp-files and cp-mongo don't exist yet,
 * so this is intentionally the simplest possible thing that could work: a
 * static map, defaulting to net-adapter. Replace with real config (env,
 * database, whatever) once more than one backend actually exists — no
 * point designing that now.
 */

export type CpBackendKind = "net-adapter" | "files" | "mongo";

const REPO_BACKEND_OVERRIDES: Record<string, CpBackendKind> = {};

export function getBackendKindForRepo(repoGuid: string): CpBackendKind {
  return REPO_BACKEND_OVERRIDES[repoGuid] ?? "net-adapter";
}
