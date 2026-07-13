/**
 * cp-files — implements cp-core's ContentProviderStorage by reading from
 * and writing to disk. Stage 2 (read: GetItem, GetByNames, GetManyByName,
 * FindRecursively) and Stage 3 (write: Put, PostParentItem — both `Ref`
 * variants throw, unconfirmed against real .NET behavior) are both live.
 *
 * Behavior confirmed two ways: (1) live comparison against the real,
 * running .NET API (localhost:12024, bind-mounted to the same real
 * Dropbox data this file reads) on 2026-07-12; (2) a full audit of
 * `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg`
 * and its `SimpleRunTests` test project, same day. Where the two sources
 * agreed, that's cited as "confirmed"; where this file intentionally
 * diverges from .NET (see each note below), that's called out explicitly.
 *
 * Key behaviors:
 *
 * 1. `CpItem.Address`/`Config.address` is ALWAYS `repoGuid` + "/" + the
 *    physical loca path actually traversed — NEVER config.yaml's own
 *    `address` field verbatim. .NET's `MigrationWorker.TryMigrateConfig`
 *    overwrites the in-memory `address` unconditionally on every read
 *    (source-audit confirmed: the overwrite happens BEFORE the
 *    "did it change" check, so a stale on-disk `address` is never visible
 *    to callers, but — a real .NET quirk, not replicated here since it's
 *    only about whether .NET rewrites the file, which cp-files never does
 *    anyway — that same staleness is also never persisted back to disk
 *    unless `id`/`type` were ALSO missing).
 *
 * 2. `Folder`-type items' `Body` is a `{childIndex: childName}` JSON map
 *    (confirmed live and via `ReadFolderWorker.ListOfIndexesQNames`).
 *    `Ref`-type children are dereferenced IN the map — the value shown is
 *    the target's name, not the Ref's own (`SelectIndexQName`,
 *    source-audit confirmed).
 *
 * 3. `GetManyByName(repo, parentLoca, name)` searches GRANDCHILDREN of
 *    `parentLoca` (for each direct child, look at THAT child's own
 *    children for one named `name`) — confirmed live AND via
 *    `ManyItemsWorker.GetManyByName`'s source. A direct-child group whose
 *    grandchildren have MORE THAN ONE match for `name` is silently
 *    skipped entirely (.NET's inner `SingleOrDefault` throws, caught by
 *    the surrounding try/catch in `GetManyByName` itself) — replicated
 *    here exactly, not an approximation.
 *
 * 4. `GetByNames` descent uses `SingleOrDefault` semantics per source
 *    audit: more than one direct child sharing the same logical `name`
 *    at any level is NOT "first match wins" — it throws
 *    `ContentProviderError`, matching .NET's uncaught
 *    `InvalidOperationException`. Case-sensitive ordinal match, confirmed.
 *
 * 5. `FindRecursively(repo, loca, phrase)` — confirmed via
 *    `MethodWorker.FindRecursively`'s source — searches ONLY `body.txt`
 *    file contents (i.e. only Text-type items are ever candidates), a
 *    plain case-insensitive substring match. It does NOT match against
 *    `name` — an earlier version of this file incorrectly also matched
 *    name, fixed after the source audit. Throws on an empty phrase,
 *    matching .NET's `ArgumentException`.
 *
 * 6. `Ref`-type items are fully dereferenced on `GetItem`/anywhere else a
 *    single item is read: the item you get back IS the target item
 *    (config, body, address all become the target's) — confirmed via
 *    `ReadRefWorker.IfMineGetItem`'s source. `refAddress` is parsed with
 *    the same "split on first slash" rule .NET's
 *    `CreateAddressFromString` uses (see `paths.ts`'s
 *    `parseAddressString`) — no validation that the resulting `repo` is
 *    an actual GUID, so a stale/legacy `refAddress` (the only kind found
 *    in real local data — all 68 real Ref items use one) fails exactly
 *    like real .NET does (confirmed live: the real API throws
 *    `PathWorker.HandleError` on one of these). NOT replicated: .NET's
 *    extra guid-staleness cross-check/self-heal
 *    (`GuidWorker.UpdateRefItemIfNeeded`) — this file dereferences by
 *    `refAddress` directly, a deliberate simplification flagged in
 *    README.md, since that logic is deep, low-value for Stage 2's
 *    read-only scope, and couldn't be verified against any real data
 *    (no real Ref item in the local dataset has a resolvable target).
 *
 * Deliberate divergences from .NET (documented in README.md, not
 * "approximations" — conscious choices for a read-only browsing tool):
 * - A missing/corrupt config.yaml throws `ContentProviderError` here;
 *   .NET silently degrades to an empty dict (swallowed at the YAML-parse
 *   layer) and then usually crashes anyway once required keys turn out
 *   missing — throwing immediately is more useful, not less faithful in
 *   any way that matters for browsing.
 * - A missing body.txt on a Text item returns `""` here; real .NET
 *   crashes with an uncaught `FileNotFoundException`. Softer on purpose.
 * - A single unreadable child is skipped (not fatal) when building a
 *   Folder's child-name-map; real .NET lets one bad child crash the
 *   entire parent Folder's `GetItem`. Softer on purpose.
 */

import type { ContentProviderStorage, CpItem, CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";
import {
  getItemDir,
  getRepoDir,
  getStorageRoot,
  locaToSegments,
  segmentsToLoca,
  parseAddressString,
} from "./paths.js";
import { readConfig, writeConfig } from "./config.js";
import { readBody, writeBody, getBodyPath } from "./body.js";
import { listChildNames, validateAllChildrenNumeric, getNextChildIndex } from "./children.js";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";

interface ResolvedItem {
  repoGuid: string;
  loca: string;
  itemDir: string;
  config: CpConfig;
}

function computeAddress(repoGuid: string, loca: string): string {
  return loca ? `${repoGuid}/${loca}` : repoGuid;
}

function normalizeLoca(loca: string | undefined | null): string {
  return segmentsToLoca(locaToSegments(loca));
}

/**
 * Reads config at (repoGuid, loca) and, if it's a `Ref`, follows
 * `refAddress` to the real target — recursively, in case of a Ref
 * pointing at another Ref (mirrors .NET's `ReadMultiWorker.GetItem`
 * being re-invoked on the resolved target).
 */
async function resolveItem(repoGuid: string, loca: string, seen: Set<string> = new Set()): Promise<ResolvedItem> {
  const key = `${repoGuid}/${loca}`;
  if (seen.has(key)) {
    throw new ContentProviderError(`Ref cycle detected while resolving "${key}"`);
  }
  seen.add(key);

  const itemDir = getItemDir(repoGuid, loca);
  const config = await readConfig(itemDir);

  if (config.type !== "Ref") {
    return { repoGuid, loca, itemDir, config };
  }

  if (!config.refAddress) {
    throw new ContentProviderError(`Ref item at "${key}" has no refAddress`);
  }
  const { repo: targetRepo, loca: targetLocaRaw } = parseAddressString(config.refAddress);
  const targetLoca = normalizeLoca(targetLocaRaw);
  return resolveItem(targetRepo, targetLoca, seen);
}

/**
 * Folder-type Body: `{childIndex: childName}`, dereferencing Ref children
 * to the target's name (matches `ReadFolderWorker.SelectIndexQName`).
 * A child that can't be resolved (missing config, or a Ref that fails to
 * dereference) is skipped, not fatal — see this file's top comment.
 */
async function buildChildNameMap(itemDir: string): Promise<Record<string, string>> {
  const childNames = await listChildNames(itemDir);
  const map: Record<string, string> = {};
  for (const childName of childNames) {
    const childDir = `${itemDir}/${childName}`;
    const config = await readConfig(childDir).catch(() => undefined);
    if (!config) continue;

    if (config.type === "Ref" && config.refAddress) {
      const { repo: targetRepo, loca: targetLocaRaw } = parseAddressString(config.refAddress);
      const resolved = await resolveItem(targetRepo, normalizeLoca(targetLocaRaw)).catch(() => undefined);
      if (resolved) {
        map[childName] = resolved.config.name;
      }
      continue;
    }

    map[childName] = config.name;
  }
  return map;
}

async function computeBody(config: CpConfig, itemDir: string): Promise<string> {
  if (config.type === "Text") {
    return readBody(itemDir);
  }
  if (config.type === "Folder") {
    return JSON.stringify(await buildChildNameMap(itemDir));
  }
  return "";
}

/**
 * `config.address` is overridden with the computed (self-healed) address
 * before being returned — confirmed live and via source that .NET's
 * Settings.address in the response is ALSO the recomputed value, not
 * whatever's stale on disk.
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

async function readItemAt(repoGuid: string, loca: string): Promise<CpItem> {
  const resolved = await resolveItem(repoGuid, loca);
  const body = await computeBody(resolved.config, resolved.itemDir);
  return toCpItem(resolved.config, body, computeAddress(resolved.repoGuid, resolved.loca));
}

/**
 * Descends from `startDir` matching each `names` entry against child
 * config.yaml `name` fields — logical names live in config.yaml, not on
 * the physical (numeric) folder. Case-sensitive, ordinal match
 * (`config?.name === name`), matching .NET. More than one direct child
 * sharing the same name at any level throws `ContentProviderError`,
 * matching .NET's uncaught `SingleOrDefault` exception — NOT "first
 * match wins" (an earlier version of this file did that; fixed after the
 * source audit).
 */
async function resolveDirByNames(startDir: string, names: string[]): Promise<{ dir: string; segments: string[] }> {
  let currentDir = startDir;
  const segments: string[] = [];
  for (const name of names) {
    const childNames = await listChildNames(currentDir);
    const matches: string[] = [];
    for (const childName of childNames) {
      const childDir = `${currentDir}/${childName}`;
      const config = await readConfig(childDir).catch(() => undefined);
      if (config?.name === name) {
        matches.push(childName);
      }
    }
    if (matches.length === 0) {
      throw new ContentProviderError(`No child named "${name}" under "${currentDir}"`);
    }
    if (matches.length > 1) {
      throw new ContentProviderError(
        `Ambiguous: ${matches.length} children named "${name}" under "${currentDir}" — matches .NET's SingleOrDefault throwing on duplicate names.`
      );
    }
    segments.push(matches[0]);
    currentDir = `${currentDir}/${matches[0]}`;
  }
  return { dir: currentDir, segments };
}

export const filesStorage: ContentProviderStorage = {
  async GetItem(repoGuid, loca) {
    return readItemAt(repoGuid, normalizeLoca(loca));
  },

  async GetByNames(repoGuid, ...names) {
    const repoDir = getRepoDir(repoGuid, getStorageRoot());
    const { segments } = await resolveDirByNames(repoDir, names);
    return readItemAt(repoGuid, segmentsToLoca(segments));
  },

  /**
   * Searches GRANDCHILDREN of `parentLoca`, not direct children —
   * confirmed live AND via `ManyItemsWorker.GetManyByName`'s source: for
   * each direct child of `parentLoca` (e.g. a lead folder), look at THAT
   * child's own children for one named `name`. A direct-child group with
   * more than one matching grandchild is skipped entirely (matches
   * .NET's inner SingleOrDefault-throws / outer try-catch-continue).
   */
  async GetManyByName(repoGuid, parentLoca, name) {
    const normalizedParentLoca = normalizeLoca(parentLoca);
    const parentDir = getItemDir(repoGuid, normalizedParentLoca);
    const parentSegments = locaToSegments(normalizedParentLoca);
    const groupNames = await listChildNames(parentDir);
    const matches: CpItem[] = [];
    for (const groupName of groupNames) {
      const groupDir = `${parentDir}/${groupName}`;
      const grandchildNames = await listChildNames(groupDir);
      const groupMatches: string[] = [];
      for (const grandchildName of grandchildNames) {
        const config = await readConfig(`${groupDir}/${grandchildName}`).catch(() => undefined);
        if (config?.name === name) {
          groupMatches.push(grandchildName);
        }
      }
      if (groupMatches.length !== 1) {
        continue; // 0 matches: nothing to add. >1 matches: ambiguous, .NET skips the whole group.
      }
      const loca = segmentsToLoca([...parentSegments, groupName, groupMatches[0]]);
      matches.push(await readItemAt(repoGuid, loca));
    }
    return matches;
  },

  /**
   * Searches only `body.txt` contents (Text items) — never item names —
   * case-insensitive substring match, confirmed via
   * `MethodWorker.FindRecursively`'s source. Throws on an empty phrase,
   * matching .NET's `ArgumentException`.
   */
  async FindRecursively(repoGuid, loca, phrase) {
    if (!phrase) {
      throw new ContentProviderError("FindRecursively: phrase must not be empty");
    }
    const normalizedLoca = normalizeLoca(loca);
    const startDir = getItemDir(repoGuid, normalizedLoca);
    const startSegments = locaToSegments(normalizedLoca);
    const needle = phrase.toLowerCase();
    const results: CpItem[] = [];

    async function walk(dir: string, segments: string[]): Promise<void> {
      const hasBody = await access(getBodyPath(dir)).then(() => true).catch(() => false);
      if (hasBody) {
        try {
          const body = await readBody(dir);
          if (body.toLowerCase().includes(needle)) {
            const config = await readConfig(dir);
            results.push(toCpItem(config, body, computeAddress(repoGuid, segmentsToLoca(segments))));
          }
        } catch {
          // Matches .NET: a per-file error (unreadable/bad config) is skipped, not fatal to the whole search.
        }
      }

      const childNames = await listChildNames(dir);
      for (const childName of childNames) {
        await walk(`${dir}/${childName}`, [...segments, childName]);
      }
    }

    await walk(startDir, startSegments);
    return results;
  },

  /**
   * Idempotent get-or-create, matching `PostWriteTextWorker`/
   * `PostWriteFolderWorker`'s source: if a direct child of `parentLoca`
   * already has this `name`, its existing data is returned (no
   * duplicate created); otherwise a new child is created at the next
   * free numeric index (`max(existing)+1`, via `getNextChildIndex`) with
   * a fresh GUID `id`. `Text` children get an empty `body.txt`; `Folder`
   * children don't (matches source). `Ref` PostParentItem wasn't part of
   * the 2026-07-12 source audit — throws rather than guessing.
   *
   * Validates every direct child of `parentLoca` is numeric before
   * creating anything (`ValidationWorker.ValidateParentBeforeCreateChild`).
   */
  async PostParentItem(repoGuid, parentLoca, type: CpItemType, name) {
    if (type === "Ref") {
      throw new ContentProviderError(
        "PostParentItem for type Ref was not confirmed against real .NET behavior (out of the 2026-07-12 source audit's scope) — not implemented rather than guessed."
      );
    }
    if (type !== "Text" && type !== "Folder") {
      throw new ContentProviderError(`PostParentItem: unknown type "${type}"`);
    }

    const normalizedParentLoca = normalizeLoca(parentLoca);
    const parentDir = getItemDir(repoGuid, normalizedParentLoca);
    await validateAllChildrenNumeric(parentDir);

    const parentSegments = locaToSegments(normalizedParentLoca);
    const childNames = await listChildNames(parentDir);
    const existingMatches: string[] = [];
    for (const childName of childNames) {
      const config = await readConfig(`${parentDir}/${childName}`).catch(() => undefined);
      if (config?.name === name) {
        existingMatches.push(childName);
      }
    }
    if (existingMatches.length > 1) {
      throw new ContentProviderError(
        `Ambiguous: ${existingMatches.length} children named "${name}" already exist under "${parentDir}"`
      );
    }
    if (existingMatches.length === 1) {
      const existingLoca = segmentsToLoca([...parentSegments, existingMatches[0]]);
      return readItemAt(repoGuid, existingLoca);
    }

    const newIndex = await getNextChildIndex(parentDir);
    const newLoca = segmentsToLoca([...parentSegments, newIndex]);
    const newItemDir = getItemDir(repoGuid, newLoca);
    const config: CpConfig = { id: randomUUID(), type, name, address: computeAddress(repoGuid, newLoca) };
    await writeConfig(newItemDir, config);
    if (type === "Text") {
      await writeBody(newItemDir, "");
    }
    return readItemAt(repoGuid, newLoca);
  },

  /**
   * NOT "find by name" — targets an existing numeric `loca` directly and
   * overwrites unconditionally with a FRESH GUID `id` every time (does
   * NOT preserve a previous id), matching `PutWriteTextWorker`/
   * `PutWriteFolderWorker`'s source. Validates every segment of `loca`
   * itself is numeric first (`ValidationWorker.ValidateItemLocaBeforePut`).
   *
   * FAITHFULLY REPLICATES A REAL, CONFIRMED .NET BUG: `PutWriteFolderWorker.IfMinePut`
   * hard-codes `type: "Text"` in the written config regardless of the
   * requested type — calling `Put(..., "Folder", ...)` on an existing
   * Folder silently corrupts its type to "Text" (and, matching that same
   * source, does NOT write a body.txt — so the result is a directory
   * whose config.yaml claims `type: "Text"` but has no body.txt at all).
   * Replicated deliberately, not accidentally: cp-files' whole purpose is
   * behavioral parity, and "fixing" this here would make cp-files and
   * cp-net-adapter (proxying the real, still-buggy .NET) disagree on a
   * real write path. See README.md's "Put/PostParentItem" section.
   *
   * `Ref` Put wasn't part of the 2026-07-12 source audit's confirmed
   * scope — throws rather than guessing.
   */
  async Put(repoGuid, loca, type: CpItemType, name, content) {
    if (type === "Ref") {
      throw new ContentProviderError(
        "Put for type Ref was not confirmed against real .NET behavior (out of the 2026-07-12 source audit's scope) — not implemented rather than guessed."
      );
    }
    if (type !== "Text" && type !== "Folder") {
      throw new ContentProviderError(`Put: unknown type "${type}"`);
    }

    const normalizedLoca = normalizeLoca(loca);
    const itemDir = getItemDir(repoGuid, normalizedLoca); // throws on a non-numeric loca segment, matching ValidateItemLocaBeforePut

    // The real .NET bug: the Folder writer always persists type: "Text", never "Folder".
    const persistedType: CpItemType = "Text";
    const config: CpConfig = {
      id: randomUUID(),
      type: type === "Folder" ? persistedType : type,
      name,
      address: computeAddress(repoGuid, normalizedLoca),
    };
    await writeConfig(itemDir, config);
    if (type === "Text") {
      await writeBody(itemDir, content);
    }
    // type === "Folder": matches source — no body.txt written, even though config now says type: "Text".

    return readItemAt(repoGuid, normalizedLoca);
  },
};
