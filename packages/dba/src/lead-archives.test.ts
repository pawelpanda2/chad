import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertValidLeadArchiveId,
  buildReadableArchiveFileName,
  deleteLeadArchive,
  detectArchiveTypeFromBytes,
  getLeadArchiveReadInfo,
  getUserLeadArchiveViewDir,
  getUserLeadArchivesDir,
  LeadArchiveError,
  listLeadArchiveCounts,
  listLeadArchives,
  saveLeadArchive,
  sanitizeLeadNameForArchiveFile,
  LEAD_ARCHIVE_VIEW,
} from "./lead-archives.js";
import { createMemoryLeadArchiveStore } from "./lead-archives-store.js";
import { runWithRepoContext } from "./repo-context.js";

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 1, 2, 3, 4]);
const RAR_BYTES = new Uint8Array([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0, 1, 2, 3]);
const FAKE_ZIP = new TextEncoder().encode("not-a-zip-but-named.zip");
const PNG_AS_ZIP = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const PAWEL = { repoGuid: "repo-guid-pawel", username: "pawel_f" };
const KAMIL = { repoGuid: "repo-guid-kamil", username: "kamil_s" };
const LEAD_UUID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEAD_UUID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LEAD_NAME_A = "26-05-11_pn_Daria";
const LEAD_NAME_B = "26-06-03_pn_Anna";

describe("lead-archives — magic bytes + ids + naming", () => {
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

  it("sanitizes lead names and resolves collisions with _2, _3", () => {
    expect(sanitizeLeadNameForArchiveFile("26-05-11_pn_Daria")).toBe("26-05-11_pn_Daria");
    expect(sanitizeLeadNameForArchiveFile("../evil/name")).toBe("evil-name");
    const existing = new Set(["26-05-11_pn_Daria.zip"]);
    expect(buildReadableArchiveFileName("26-05-11_pn_Daria", "zip", existing)).toBe(
      "26-05-11_pn_Daria_2.zip",
    );
    existing.add("26-05-11_pn_Daria_2.zip");
    expect(buildReadableArchiveFileName("26-05-11_pn_Daria", "zip", existing)).toBe(
      "26-05-11_pn_Daria_3.zip",
    );
  });
});

describe("saveLeadArchive / list / counts / isolation", () => {
  let rootDir: string;
  let store: ReturnType<typeof createMemoryLeadArchiveStore>;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-archives-"));
    store = createMemoryLeadArchiveStore();
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves under .../02_files_zip/manually-added-msg with readable name; no sidecar", async () => {
    const result = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "chat.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const viewDir = getUserLeadArchiveViewDir("pawel_f", rootDir);
    expect(viewDir.endsWith(path.join("pawel_f", "02_files_zip", LEAD_ARCHIVE_VIEW))).toBe(true);
    expect(result.fileName).toBe("26-05-11_pn_Daria.zip");
    expect(result.storagePath).toBe(
      `02_files_refrenced/pawel_f/02_files_zip/${LEAD_ARCHIVE_VIEW}/26-05-11_pn_Daria.zip`,
    );
    expect(result.leadUuid).toBe(LEAD_UUID_A);
    expect(result.id).not.toBe(result.fileName);
    const onDisk = await readFile(path.join(viewDir, result.fileName));
    expect(Buffer.compare(onDisk, Buffer.from(ZIP_BYTES))).toBe(0);
    const names = await readdir(viewDir);
    expect(names.some((n) => n.endsWith(".json"))).toBe(false);
  });

  it("rejects fake .zip / wrong declared ext", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadArchive({
          bytes: FAKE_ZIP,
          originalFileName: "evil.zip",
          declaredExt: "zip",
          leadUuid: LEAD_UUID_A,
          leadNameAtExport: LEAD_NAME_A,
          rootDirectory: rootDir,
          metadataStore: store,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_TYPE" });
  });

  it("lists by leadUuid after rename snapshot; filename stays historical", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "a.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(saved.fileName).toBe("26-05-11_pn_Daria.zip");
    expect(saved.leadNameAtExport).toBe(LEAD_NAME_A);

    // Rename of lead does not change UUID — list still finds the archive
    const renamedLeadName = "26-05-11_pn_Daria-K";
    const listed = await runWithRepoContext(PAWEL, () =>
      listLeadArchives(LEAD_UUID_A, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(listed).toHaveLength(1);
    expect(listed[0].fileName).toBe("26-05-11_pn_Daria.zip");
    expect(listed[0].leadNameAtExport).toBe(LEAD_NAME_A);
    expect(listed[0].leadUuid).toBe(LEAD_UUID_A);
    // New upload after rename uses new display name for file; old row unchanged
    const second = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "b.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: renamedLeadName,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(second.fileName).toBe("26-05-11_pn_Daria-K.zip");
    const again = await runWithRepoContext(PAWEL, () =>
      listLeadArchives(LEAD_UUID_A, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(again).toHaveLength(2);
    expect(again.some((a) => a.fileName === "26-05-11_pn_Daria.zip")).toBe(true);
  });

  it("collision does not overwrite", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "a.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      await saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "b.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      });
    });
    const viewDir = getUserLeadArchiveViewDir("pawel_f", rootDir);
    const files = (await readdir(viewDir)).filter((n) => n.endsWith(".zip"));
    expect(files.sort()).toEqual(["26-05-11_pn_Daria.zip", "26-05-11_pn_Daria_2.zip"].sort());
  });

  it("counts and per-lead list use leadUuid", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "a.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      await saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "b.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      await saveLeadArchive({
        bytes: RAR_BYTES,
        originalFileName: "c.rar",
        leadUuid: LEAD_UUID_B,
        leadNameAtExport: LEAD_NAME_B,
        rootDirectory: rootDir,
        metadataStore: store,
      });
    });
    const forA = await runWithRepoContext(PAWEL, () =>
      listLeadArchives(LEAD_UUID_A, { rootDirectory: rootDir, metadataStore: store }),
    );
    const forB = await runWithRepoContext(PAWEL, () =>
      listLeadArchives(LEAD_UUID_B, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(forA).toHaveLength(2);
    expect(forB).toHaveLength(1);
    const counts = await runWithRepoContext(PAWEL, () =>
      listLeadArchiveCounts({ rootDirectory: rootDir, metadataStore: store }),
    );
    expect(counts[LEAD_UUID_A]).toBe(2);
    expect(counts[LEAD_UUID_B]).toBe(1);
  });

  it("cross-user isolation", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "mine.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const kamilList = await runWithRepoContext(KAMIL, () =>
      listLeadArchives(LEAD_UUID_A, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(kamilList).toHaveLength(0);
    await expect(
      runWithRepoContext(KAMIL, () =>
        deleteLeadArchive(saved.id, { rootDirectory: rootDir, metadataStore: store }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getLeadArchiveReadInfo returns path for owner; null for other user", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadArchive({
        bytes: ZIP_BYTES,
        originalFileName: "mine.zip",
        leadUuid: LEAD_UUID_A,
        leadNameAtExport: LEAD_NAME_A,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const info = await runWithRepoContext(PAWEL, () =>
      getLeadArchiveReadInfo(saved.id, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(info?.fileName).toBe("26-05-11_pn_Daria.zip");
    expect(info?.mimeType).toBe("application/zip");
    const onDisk = await readFile(info!.filePath);
    expect(Buffer.compare(onDisk, Buffer.from(ZIP_BYTES))).toBe(0);

    const other = await runWithRepoContext(KAMIL, () =>
      getLeadArchiveReadInfo(saved.id, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(other).toBeNull();
  });

  it("reads legacy sidecars by leadLoca without deleting them", async () => {
    const zipDir = getUserLeadArchivesDir("pawel_f", rootDir);
    await mkdir(zipDir, { recursive: true });
    const legacyId = "2026-08-08_11-50-04_legacy-uuid.zip";
    await writeFile(path.join(zipDir, legacyId), ZIP_BYTES);
    await writeFile(
      path.join(zipDir, `${legacyId}.json`),
      JSON.stringify({
        id: legacyId,
        repoGuid: PAWEL.repoGuid,
        ownerUsername: "pawel_f",
        leadLoca: "03/06/81",
        storageKey: legacyId,
        originalFileName: "old.zip",
        fileType: "zip",
        sizeBytes: ZIP_BYTES.byteLength,
        createdAt: "2026-08-08T11:50:04.000Z",
      }),
    );
    const listed = await runWithRepoContext(PAWEL, () =>
      listLeadArchives(LEAD_UUID_A, {
        rootDirectory: rootDir,
        metadataStore: store,
        leadLoca: "03/06/81",
      }),
    );
    expect(listed.some((a) => a.id === legacyId)).toBe(true);
    // sidecar still on disk
    await expect(readFile(path.join(zipDir, `${legacyId}.json`), "utf8")).resolves.toBeTruthy();
  });
});
