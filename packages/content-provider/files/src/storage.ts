/**
 * cp-files — implements cp-core's ContentProviderStorage by reading
 * directly from disk. Read-only in Stage 2: GetItem, GetByNames,
 * GetManyByName, FindRecursively. Put/PostParentItem throw — Stage 3.
 *
 * Two behaviors below were confirmed against the real, LIVE .NET API
 * (localhost:12024, mounted to the same real Dropbox data cp-files reads)
 * on 2026-07-12, and differ from an earlier, wrong assumption in this file:
 *
 * 1. `CpItem.Address` is ALWAYS `repoGuid` + "/" + the physical loca path
 *    that was actually traversed to reach the item — NEVER config.yaml's
 *    own `address` field verbatim. .NET's `MigrationWorker.TryMigrateConfig`
 *    recomputes/self-heals `address` on every single read (not just for
 *    "legacy" items) and returns the corrected value — confirmed live:
 *    repo `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`'s item at loca
 *    "03/06/71/01" has a stale `address: "Active/06/64/01"` literally
 *    stored in its config.yaml on disk, but the real API returns
 *    `Settings.address: "21d11bdc-f1f4-44d1-b61a-3fa6b039c641/03/06/71/01"`
 *    — the correct, recomputed physical address, not the stale stored one.
 *
 * 2. `Folder`-type items' `Body` is a JSON object mapping each numeric
 *    child folder name to that child's logical `config.yaml` name (e.g.
 *    `{"06": "all items", "07": "all missing"}`) — confirmed live against
 *    a real "leads" folder, and matches `documentation/dba/resolve-paths.md`'s
 *    `leadsNameMap` example. `Text`-type items' `Body` is body.txt's raw
 *    content, confirmed live too. `CpItem.Body` is typed `string`
 *    (cp-core), so the Folder map is JSON-stringified — same convention
 *    `cp-net-adapter` already uses for non-string `/invoke` Body values.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";
import { getItemDir, getRepoDir, getStorageRoot, locaToSegments, segmentsToLoca } from "./paths.js";
import { readConfig } from "./config.js";
import { readBody } from "./body.js";
import { listChildNames, buildChildNameMap } from "./children.js";

function computeAddress(repoGuid: string, loca: string): string {
  return loca ? `${repoGuid}/${loca}` : repoGuid;
}

function normalizeLoca(loca: string | undefined | null): string {
  return segmentsToLoca(locaToSegments(loca));
}

async function computeBody(config: CpConfig, itemDir: string): Promise<string> {
  if (config.type === "Text") {
    return readBody(itemDir);
  }
  if (config.type === "Folder") {
    return JSON.stringify(await buildChildNameMap(itemDir));
  }
  // type === "Ref": not dereferenced yet (see README.md's "Known approximations").
  return "";
}

/**
 * `config.address` is overridden with the computed (self-healed) address
 * before being returned — confirmed live that .NET's Settings.address in
 * the response is ALSO the recomputed value, not whatever's stale on disk
 * (e.g. repo 21d11bdc.../03/06/71/01 has address: "Active/06/64/01" on
 * disk, but the real API returns Settings.address matching the top-level,
 * recomputed Address). Raw disk config is never trusted for addressing.
 */
function toCpItem(config: CpConfig, body: string, address: string): CpItem {
  const healedConfig = { ...config, address };
  return {
    Body: body,
    Config: healedConfig,
    Settings: healedConfig, // legacy alias only, matches cp-net-adapter's shape
    Address: address,
  };
}

async function readItemAt(repoGuid: string, itemDir: string, loca: string): Promise<CpItem> {
  const config = await readConfig(itemDir);
  const body = await computeBody(config, itemDir);
  return toCpItem(config, body, computeAddress(repoGuid, loca));
}

/**
 * Descends from `startDir` matching each `names` entry against child
 * config.yaml `name` fields (not physical folder names — logical names
 * live in config.yaml, per Content Provider's core invariant). First
 * matching child at each level wins; ties are broken by ascending numeric
 * folder order. Approximation: exact tie-breaking semantics of the real
 * .NET GetByNames aren't confirmed by the 2026-07-12 audit — flagged in
 * cp-files/README.md as needing a compatibility-test pass.
 *
 * Returns the resolved physical loca segments alongside the directory, so
 * callers can compute the correct (self-healed) Address.
 */
async function resolveDirByNames(startDir: string, names: string[]): Promise<{ dir: string; segments: string[] }> {
  let currentDir = startDir;
  const segments: string[] = [];
  for (const name of names) {
    const childNames = await listChildNames(currentDir);
    let matchedChildName: string | undefined;
    for (const childName of childNames) {
      const childDir = `${currentDir}/${childName}`;
      const config = await readConfig(childDir).catch(() => undefined);
      if (config?.name === name) {
        matchedChildName = childName;
        break;
      }
    }
    if (!matchedChildName) {
      throw new ContentProviderError(`No child named "${name}" under "${currentDir}"`);
    }
    segments.push(matchedChildName);
    currentDir = `${currentDir}/${matchedChildName}`;
  }
  return { dir: currentDir, segments };
}

function notImplemented(operation: string): never {
  throw new ContentProviderError(
    `cp-files.${operation} is not implemented — Stage 2 scope is read-only (GetItem, GetByNames, GetManyByName, FindRecursively).`
  );
}

export const filesStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    const normalizedLoca = normalizeLoca(loca);
    const itemDir = getItemDir(repoGuid, loca);
    return readItemAt(repoGuid, itemDir, normalizedLoca);
  },

  async GetByNames(repoGuid, ...names) {
    const repoDir = getRepoDir(repoGuid, getStorageRoot());
    const { dir, segments } = await resolveDirByNames(repoDir, names);
    return readItemAt(repoGuid, dir, segmentsToLoca(segments));
  },

  /**
   * Searches GRANDCHILDREN of `parentLoca`, not direct children — confirmed
   * live: GetManyByName(repo, "03/06", "status") — "03/06" being the
   * "leads" -> "all items" folder — returns one "status" item per lead
   * folder directly under "03/06", i.e.
   * for each direct child (a lead), it looks at THAT child's own children
   * for one named `name`. Matches documentation/dba/resolve-paths.md's
   * chad_GetLeadsStatuses() usage (leadsLoca + "status" -> one status per
   * lead). An earlier version of this function searched direct children
   * instead and returned zero results for real data — fixed after
   * comparing against the live API's actual output.
   */
  async GetManyByName(repoGuid, parentLoca, name) {
    const parentDir = getItemDir(repoGuid, parentLoca);
    const parentSegments = locaToSegments(parentLoca);
    const groupNames = await listChildNames(parentDir);
    const matches: CpItem[] = [];
    for (const groupName of groupNames) {
      const groupDir = `${parentDir}/${groupName}`;
      const grandchildNames = await listChildNames(groupDir);
      for (const grandchildName of grandchildNames) {
        const grandchildDir = `${groupDir}/${grandchildName}`;
        const config = await readConfig(grandchildDir).catch(() => undefined);
        if (config?.name === name) {
          const body = await computeBody(config, grandchildDir);
          const loca = segmentsToLoca([...parentSegments, groupName, grandchildName]);
          matches.push(toCpItem(config, body, computeAddress(repoGuid, loca)));
        }
      }
    }
    return matches;
  },

  /**
   * Recursive name/body substring search under `loca`. Approximation —
   * the exact real .NET FindRecursively matching semantics (case
   * sensitivity, whether it searches Config.name, body.txt, computed
   * Folder body maps, or some combination) weren't part of the
   * 2026-07-12 audit scope; this implements the most literal reading
   * (case-insensitive substring match on name OR raw body.txt content)
   * and is flagged in cp-files/README.md as needing its own compatibility
   * pass against a real /invoke FindRecursively call before being trusted.
   */
  async FindRecursively(repoGuid, loca, phrase) {
    const startDir = getItemDir(repoGuid, loca);
    const startSegments = locaToSegments(loca);
    const needle = phrase.toLowerCase();
    const results: CpItem[] = [];

    async function walk(dir: string, segments: string[]): Promise<void> {
      const config = await readConfig(dir).catch(() => undefined);
      if (!config) return;

      const rawBody = config.type === "Text" ? await readBody(dir) : "";
      const matches =
        config.name.toLowerCase().includes(needle) || rawBody.toLowerCase().includes(needle);
      if (matches) {
        const body = await computeBody(config, dir);
        results.push(toCpItem(config, body, computeAddress(repoGuid, segmentsToLoca(segments))));
      }

      const childNames = await listChildNames(dir);
      for (const childName of childNames) {
        await walk(`${dir}/${childName}`, [...segments, childName]);
      }
    }

    await walk(startDir, startSegments);
    return results;
  },

  async Put(_repoGuid, _loca, _type: CpItemType, _name, _content) {
    notImplemented("Put");
  },

  async PostParentItem(_repoGuid, _parentLoca, _type: CpItemType, _name) {
    notImplemented("PostParentItem");
  },
};
