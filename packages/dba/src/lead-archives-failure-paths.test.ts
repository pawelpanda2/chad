/**
 * DB metadata insert failure cleans up the orphan archive file.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveLeadArchive, getUserLeadArchiveViewDir } from "./lead-archives.js";
import { createMemoryLeadArchiveStore } from "./lead-archives-store.js";
import { runWithRepoContext } from "./repo-context.js";

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const USER = { repoGuid: "repo-fail", username: "user_fail" };

describe("saveLeadArchive — metadata write failure", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-archives-fail-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("filesystem PASS + metadata FAIL → removes orphan file; no sidecar", async () => {
    const base = createMemoryLeadArchiveStore();
    const failingStore = {
      ...base,
      async insert() {
        throw new Error("simulated db failure");
      },
    };

    await expect(
      runWithRepoContext(USER, () =>
        saveLeadArchive({
          bytes: ZIP_BYTES,
          originalFileName: "x.zip",
          leadUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          leadNameAtExport: "26-05-11_pn_Daria",
          rootDirectory: rootDir,
          metadataStore: failingStore,
        }),
      ),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const dir = getUserLeadArchiveViewDir("user_fail", rootDir);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      names = [];
    }
    expect(names.filter((n) => n.endsWith(".zip") || n.endsWith(".json") || n.includes(".tmp-"))).toHaveLength(
      0,
    );
  });
});
