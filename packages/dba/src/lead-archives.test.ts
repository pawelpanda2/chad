import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertValidLeadArchiveId,
  deleteLeadArchive,
  detectArchiveTypeFromBytes,
  getUserLeadArchivesDir,
  LeadArchiveError,
  listLeadArchiveCounts,
  listLeadArchives,
  saveLeadArchive,
} from "./lead-archives.js";
import { runWithRepoContext } from "./repo-context.js";

// Minimal ZIP local-file header
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3, 4]);
// RAR signature (v5-style marker)
const RAR_BYTES = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0, 1, 2, 3]);
const FAKE_ZIP = new TextEncoder().encode("not-a-zip-but-named.zip");
const PNG_AS_ZIP = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PAWEL = { repoGuid: "repo-guid-pawel", username: "pawel_f" };
const KAMIL = { repoGuid: "repo-guid-kamil", username: "kamil_s" };
const LEAD_A = "03/06/81";
const LEAD_B = "03/06/82";

describe("lead-archives — magic bytes + ids", () => {
  it("detects zip and rar; rejects fakes", () => {
    expect(detectArchiveTypeFromBytes(ZIP_BYTES)).toBe("zip");
    expect(detectArchiveTypeFromBytes(RAR_BYTES)).toBe("rar");
    expect(detectArchiveTypeFromBytes(FAKE_ZIP)).toBeNull();
    expect(detectArchiveTypeFromBytes(PNG_AS_ZIP)).toBeNull();
  });

  it("rejects traversal-like archive ids", () => {
    expect(() => assertValidLeadArchiveId("../x")).toThrow(LeadArchiveError);
    expect(() => assertValidLeadArchiveId("a/b.zip")).toThrow(LeadArchiveError);
  });
});

describe("saveLeadArchive / list / counts / isolation", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-archives-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves under <root>/<username>/02_files_zip (not 01_files_photos)", async () => {
    const result = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "chat.zip",
        leadLoca: LEAD_A,
        rootDirectory: rootDir,
      }),
    );
    const dir = getUserLeadArchivesDir("pawel_f", rootDir);
    expect(dir.endsWith(path.join("pawel_f", "02_files_zip"))).toBe(true);
    const onDisk = await readFile(path.join(dir, result.storageKey));
    expect(Buffer.compare(onDisk, Buffer.from(ZIP_BYTES))).toBe(0);
    expect(result.fileType).toBe("zip");
    expect(result.leadLoca).toBe(LEAD_A);
    expect(result.originalFileName).toBe("chat.zip");
  });

  it("rejects fake .zip / wrong declared ext / other types", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadArchive({
          bytes: FAKE_ZIP,
          originalFileName: "evil.zip",
          declaredExt: "zip",
          leadLoca: LEAD_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TYPE" });

    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadArchive({
          bytes: ZIP_BYTES,
          originalFileName: "x.rar",
          declaredExt: "rar",
          leadLoca: LEAD_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TYPE" });
  });

  it("saves rar and keeps original name only as metadata", async () => {
    const result = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: RAR_BYTES,
        originalFileName: "../../../evil.rar",
        leadLoca: LEAD_A,
        rootDirectory: rootDir,
      }),
    );
    expect(result.fileType).toBe("rar");
    expect(result.originalFileName).toBe("evil.rar");
    expect(result.storageKey.includes("..")).toBe(false);
    expect(result.storageKey.endsWith(".rar")).toBe(true);
  });

  it("lists only the selected lead; counts are one scan", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadArchive({ bytes: ZIP_BYTES, originalFileName: "a.zip", leadLoca: LEAD_A, rootDirectory: rootDir });
      await saveLeadArchive({ bytes: ZIP_BYTES, originalFileName: "b.zip", leadLoca: LEAD_A, rootDirectory: rootDir });
      await saveLeadArchive({ bytes: RAR_BYTES, originalFileName: "c.rar", leadLoca: LEAD_B, rootDirectory: rootDir });
    });
    const forA = await runWithRepoContext(PAWEL, () => listLeadArchives(LEAD_A, { rootDirectory: rootDir }));
    const forB = await runWithRepoContext(PAWEL, () => listLeadArchives(LEAD_B, { rootDirectory: rootDir }));
    expect(forA).toHaveLength(2);
    expect(forB).toHaveLength(1);
    const counts = await runWithRepoContext(PAWEL, () => listLeadArchiveCounts({ rootDirectory: rootDir }));
    expect(counts[LEAD_A]).toBe(2);
    expect(counts[LEAD_B]).toBe(1);
  });

  it("cross-user isolation: other user cannot list or delete", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "mine.zip",
        leadLoca: LEAD_A,
        rootDirectory: rootDir,
      }),
    );
    const kamilList = await runWithRepoContext(KAMIL, () =>
      listLeadArchives(LEAD_A, { rootDirectory: rootDir }),
    );
    expect(kamilList).toHaveLength(0);
    await expect(
      runWithRepoContext(KAMIL, () => deleteLeadArchive(saved.id, { rootDirectory: rootDir })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const still = await runWithRepoContext(PAWEL, () => listLeadArchives(LEAD_A, { rootDirectory: rootDir }));
    expect(still).toHaveLength(1);
  });

  it("does not collide storage names; never overwrites", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadArchive({ bytes: ZIP_BYTES, originalFileName: "same.zip", leadLoca: LEAD_A, rootDirectory: rootDir });
      await saveLeadArchive({ bytes: ZIP_BYTES, originalFileName: "same.zip", leadLoca: LEAD_A, rootDirectory: rootDir });
    });
    const dir = getUserLeadArchivesDir("pawel_f", rootDir);
    const files = (await readdir(dir)).filter((n) => n.endsWith(".zip"));
    expect(files).toHaveLength(2);
  });
});
