/**
 * Metadata-store failure cleans up the orphan photo file (Story 111).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveLeadPhoto } from "./lead-photos.js";
import { createMemoryReferencedFileStore } from "./file-storage/metadata-store.js";
import { runWithRepoContext } from "./repo-context.js";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1]);
const USER = { repoGuid: "repo-fail", username: "user_fail" };

describe("saveLeadPhoto — metadata write failure", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-photos-fail-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("filesystem PASS + metadata FAIL → removes orphan file; no sidecar", async () => {
    const failingStore = {
      ...createMemoryReferencedFileStore(),
      async insert() {
        throw new Error("simulated db failure");
      },
    };

    await expect(
      runWithRepoContext(USER, () =>
        saveLeadPhoto({
          bytes: JPEG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "a.jpg",
          leadLoca: "03/06/81",
          leadUuid: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          leadName: "26-08-01_nn_latina",
          rootDirectory: rootDir,
          metadataStore: failingStore,
        }),
      ),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const entityDir = path.join(
      rootDir,
      "user_fail",
      "01_files_photos",
      "lead-info",
      "26-08-01_nn_latina",
    );
    let names: string[] = [];
    try {
      names = await readdir(entityDir);
    } catch {
      names = [];
    }
    expect(names.filter((n) => n.endsWith(".jpg") || n.endsWith(".json"))).toHaveLength(0);
  });
});
