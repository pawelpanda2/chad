/**
 * body.txt reader. Confirmed 2026-07-12 by reading the real .NET source
 * (`PathWorker.SetNames` / `PathWorker.GetBodyPath`,
 * `SharpRepoServiceProg/Workers/System/PathWorker.cs:39-43,87-92`) AND by
 * inspecting 12630 real config.yaml/body.txt pairs on disk: the body file
 * is unconditionally named `body.txt` — there is no extensionless `body`
 * variant, no legacy/current split, no fallback. This settles the
 * contradiction flagged in
 * documentation/content-provider/next-tasks/typescript-migration-plan.md
 * section 5.1 in favor of `body.txt`, definitively.
 *
 * Only `type: "Text"` items have a body.txt. `type: "Folder"` items never
 * do — matches `MigrationWorker.AssumeType`, which uses body.txt's
 * existence to infer Text vs Folder for config-less legacy items.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const BODY_FILE_NAME = "body.txt";

export function getBodyPath(itemDir: string): string {
  return path.join(itemDir, BODY_FILE_NAME);
}

export async function bodyExists(itemDir: string): Promise<boolean> {
  try {
    await readFile(getBodyPath(itemDir));
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns "" for Folder items (no body.txt) rather than throwing — matches
 * .NET returning an empty body for folders.
 *
 * Strips exactly one trailing newline, if present — confirmed live
 * (2026-07-12) against the real API: .NET reads body.txt line-by-line and
 * rejoins with "\n" (see `BodyWorker.GetTextLines`/`ReadTextWorker.cs:283`),
 * which drops a final trailing newline that Node's plain `readFile` would
 * otherwise preserve. A live GetItem comparison on a real Text item failed
 * on exactly this (files: "...facebookName\n", net: "...facebookName")
 * before this fix.
 */
export async function readBody(itemDir: string): Promise<string> {
  try {
    const raw = await readFile(getBodyPath(itemDir), "utf-8");
    return raw.replace(/\r?\n$/, "");
  } catch {
    return "";
  }
}
