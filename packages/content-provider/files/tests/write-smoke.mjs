#!/usr/bin/env node
/**
 * Stage 3 (Put/PostParentItem) smoke test — runs ONLY against a throwaway
 * fixture at /tmp/cp-files-write-test, NEVER against real Dropbox data.
 * Not a compatibility test (no live .NET comparison) — there is no
 * disposable real .NET instance to write-test against safely, so this
 * verifies cp-files' write behavior against the documented spec only
 * (see storage.ts's Put/PostParentItem comments, sourced from the
 * 2026-07-12 SharpRepoService audit).
 *
 * Run: node packages/content-provider/files/tests/write-smoke.mjs
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

process.env.CP_FILES_STORAGE_ROOT = "/tmp/cp-files-write-test";
if (!existsSync("/tmp/cp-files-write-test/repos/11111111-1111-1111-1111-111111111111/config.yaml")) {
  console.error("Fixture repo missing — run the setup shown in the session before this script.");
  process.exit(1);
}

const { filesStorage } = await import("../dist/index.js");
const REPO = "11111111-1111-1111-1111-111111111111";

let passes = 0;
let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
    passes++;
  } else {
    console.log(`FAIL  ${label} ${detail}`);
    failures++;
  }
}

// 1. PostParentItem creates a new Text child at "00" (no existing children).
const created = await filesStorage.PostParentItem(REPO, "", "Text", "first-child");
check("PostParentItem creates at index 00", created.Address === `${REPO}/00`, created.Address);
check("PostParentItem sets correct name/type", created.Config.name === "first-child" && created.Config.type === "Text");
check("PostParentItem creates empty body.txt for Text", created.Body === "");
check("body.txt actually exists on disk", existsSync("/tmp/cp-files-write-test/repos/11111111-1111-1111-1111-111111111111/00/body.txt"));

// 2. PostParentItem with the same name is idempotent — no duplicate, same item returned.
const again = await filesStorage.PostParentItem(REPO, "", "Text", "first-child");
check("PostParentItem is idempotent (same address)", again.Address === created.Address);
check("PostParentItem is idempotent (same id)", again.Config.id === created.Config.id);

// 3. A second, different name creates a NEW child at the next index ("01").
const second = await filesStorage.PostParentItem(REPO, "", "Folder", "second-child");
check("Second PostParentItem creates at index 01", second.Address === `${REPO}/01`, second.Address);
check("Folder PostParentItem does NOT create body.txt", !existsSync("/tmp/cp-files-write-test/repos/11111111-1111-1111-1111-111111111111/01/body.txt"));

// 4. Put overwrites the Text child directly, with a fresh id.
const beforePutId = created.Config.id;
const putResult = await filesStorage.Put(REPO, "00", "Text", "renamed-child", "hello world");
check("Put updates body content", putResult.Body === "hello world");
check("Put updates name", putResult.Config.name === "renamed-child");
check("Put assigns a FRESH id (does not preserve old one)", putResult.Config.id !== beforePutId);

// 5. Put on a Folder replicates the real .NET bug: persisted type becomes "Text", no body.txt written.
const beforeFolderPutId = second.Config.id;
const putFolderResult = await filesStorage.Put(REPO, "01", "Folder", "still-second-child", "should not be written");
check(
  "Put on Folder replicates the real .NET bug: persisted type is Text",
  putFolderResult.Config.type === "Text",
  putFolderResult.Config.type
);
check("Put on Folder does NOT write body.txt (matches the bug)", !existsSync("/tmp/cp-files-write-test/repos/11111111-1111-1111-1111-111111111111/01/body.txt"));
check("Put assigns a fresh id here too", putFolderResult.Config.id !== beforeFolderPutId);

// 6. Ref is explicitly refused (unconfirmed behavior), not guessed.
const refPostThrew = await filesStorage.PostParentItem(REPO, "", "Ref", "x").then(() => false).catch(() => true);
const refPutThrew = await filesStorage.Put(REPO, "00", "Ref", "x", "y").then(() => false).catch(() => true);
check("PostParentItem(Ref) throws (unconfirmed, not guessed)", refPostThrew);
check("Put(Ref) throws (unconfirmed, not guessed)", refPutThrew);

// 7. Put on a non-numeric loca segment is refused (ValidateItemLocaBeforePut).
const badLocaThrew = await filesStorage.Put(REPO, "abc", "Text", "x", "y").then(() => false).catch(() => true);
check("Put on non-numeric loca throws", badLocaThrew);

// 8. Repo-corruption guard: a manually-created logical-name folder blocks PostParentItem.
const { mkdir } = await import("node:fs/promises");
await mkdir("/tmp/cp-files-write-test/repos/11111111-1111-1111-1111-111111111111/leads", { recursive: true });
const corruptionThrew = await filesStorage.PostParentItem(REPO, "", "Text", "another-child").then(() => false).catch(() => true);
check("PostParentItem refuses to create a child when a non-numeric sibling folder exists", corruptionThrew);

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
