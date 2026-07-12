/**
 * Route handlers. GET-only — no write endpoints yet (Stage 3, once
 * cp-files/cp-mongo implement Put/PostParentItem for real).
 *
 * All per-repo item operations (`/repos/:repoId/...`) go through
 * `cp-entry`'s `entry` — the routing rule this whole package exists to
 * enforce: an endpoint never talks to cp-files/cp-mongo/cp-net-adapter
 * directly, only to cp-entry, which picks the backend per repo.
 *
 * ONE exception, documented rather than silently done: `GET /repos` (list
 * all repos) and `/storage/status` call `cp-files`'s `listRepos`/
 * `diagnoseStorage` directly. Repo discovery isn't part of
 * `ContentProviderStorage` (cp-core's shared contract) — it's inherently
 * storage-backend-specific (a filesystem walk for cp-files; a distinct
 * query for cp-mongo; a to-be-designed operation for cp-net-adapter,
 * which has no such "list everything" operation on the real .NET API
 * either). Since cp-files is currently the only backend with cp-mongo
 * still skeleton-only, this endpoint is only ever going to be accurate
 * for repos actually served by cp-files — flagged here and in README.md,
 * not silently assumed to generalize.
 */

import type { ServerResponse } from "node:http";
import { entry } from "cp-entry";
import { listRepos, diagnoseStorage } from "cp-files";
import { ContentProviderError } from "cp-core";
import { sendJson, sendError } from "./http.js";

function handleThrown(res: ServerResponse, err: unknown): void {
  if (err instanceof ContentProviderError) {
    sendError(res, 404, err.message);
    return;
  }
  if (err instanceof Error) {
    sendError(res, 400, err.message);
    return;
  }
  sendError(res, 500, "Unknown error");
}

export async function handleHealth(res: ServerResponse): Promise<void> {
  sendJson(res, 200, { status: "ok", timestamp: new Date().toISOString() });
}

export async function handleStorageStatus(res: ServerResponse): Promise<void> {
  try {
    const diagnostics = await diagnoseStorage();
    sendJson(res, 200, { files: diagnostics });
  } catch (err) {
    handleThrown(res, err);
  }
}

export async function handleListRepos(res: ServerResponse): Promise<void> {
  try {
    const repos = await listRepos();
    sendJson(res, 200, repos);
  } catch (err) {
    handleThrown(res, err);
  }
}

export async function handleGetItem(res: ServerResponse, repoId: string, loca: string): Promise<void> {
  try {
    const item = await entry.GetItem(repoId, loca);
    sendJson(res, 200, item);
  } catch (err) {
    handleThrown(res, err);
  }
}

export async function handleGetByNames(res: ServerResponse, repoId: string, names: string[]): Promise<void> {
  if (names.length === 0) {
    sendError(res, 400, "At least one name is required (?names=a,b,c)");
    return;
  }
  try {
    const item = await entry.GetByNames(repoId, ...names);
    sendJson(res, 200, item);
  } catch (err) {
    handleThrown(res, err);
  }
}

export async function handleGetManyByName(
  res: ServerResponse,
  repoId: string,
  parentLoca: string,
  name: string
): Promise<void> {
  if (!name) {
    sendError(res, 400, "?name= is required");
    return;
  }
  try {
    const items = await entry.GetManyByName(repoId, parentLoca, name);
    sendJson(res, 200, items);
  } catch (err) {
    handleThrown(res, err);
  }
}

export async function handleFindRecursively(
  res: ServerResponse,
  repoId: string,
  loca: string,
  phrase: string
): Promise<void> {
  if (!phrase) {
    sendError(res, 400, "?phrase= is required");
    return;
  }
  try {
    const items = await entry.FindRecursively(repoId, loca, phrase);
    sendJson(res, 200, items);
  } catch (err) {
    handleThrown(res, err);
  }
}
