/**
 * config.yaml reader. Read-only — cp-files does not write in Stage 2.
 *
 * .NET deserializes config.yaml as a loose `Dictionary<string, object>`
 * (`ConfigWorker.cs`), not a closed schema — mirrored here by reading into
 * `Record<string, unknown>` and only asserting `type`/`name`/`id` (the
 * fields `ItemModel.SetIndentificators` enforces) are present.
 *
 * `address` is deliberately NOT required/validated here, even though
 * `ItemModel.SetIndentificators` nominally requires it too: confirmed
 * live (2026-07-12, against localhost:12024) that .NET recomputes/
 * self-heals `address` on EVERY read via `MigrationWorker.TryMigrateConfig`
 * — real repo-root config.yaml on disk has `address: ""`, which would fail
 * a naive required-field check, yet the real API returns it fine (as the
 * repoGuid). cp-files' `storage.ts` always computes `Address`/`Config.address`
 * itself (see its top comment) rather than trusting the raw on-disk value,
 * so requiring it here would only reject valid real data for no benefit.
 *
 * Also deliberately NOT replicating .NET's self-healing by WRITING the
 * repair back to disk — that's a write operation, out of scope for a
 * read-only Stage 2 provider.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import type { CpConfig, CpItemType } from "cp-core";
import { ContentProviderError } from "cp-core";

const CONFIG_FILE_NAME = "config.yaml";

const VALID_ITEM_TYPES: readonly CpItemType[] = ["Folder", "Text", "Ref"];

function isValidItemType(value: unknown): value is CpItemType {
  return typeof value === "string" && (VALID_ITEM_TYPES as readonly string[]).includes(value);
}

export function getConfigPath(itemDir: string): string {
  return path.join(itemDir, CONFIG_FILE_NAME);
}

export async function readConfig(itemDir: string): Promise<CpConfig> {
  const configPath = getConfigPath(itemDir);
  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch (err) {
    throw new ContentProviderError(`config.yaml not found or unreadable at "${configPath}"`, { cause: err });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (err) {
    throw new ContentProviderError(`config.yaml at "${configPath}" is not valid YAML`, { cause: err });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ContentProviderError(`config.yaml at "${configPath}" did not parse to an object`);
  }

  const dict = parsed as Record<string, unknown>;

  for (const requiredKey of ["type", "name", "id"] as const) {
    if (dict[requiredKey] === undefined || dict[requiredKey] === null || dict[requiredKey] === "") {
      throw new ContentProviderError(
        `config.yaml at "${configPath}" is missing required key "${requiredKey}" (matches .NET's ItemModel.SetIndentificators requirement — see cp-files, not auto-repaired here)`
      );
    }
  }

  if (!isValidItemType(dict.type)) {
    throw new ContentProviderError(`config.yaml at "${configPath}" has unknown type "${String(dict.type)}"`);
  }

  return dict as CpConfig;
}
