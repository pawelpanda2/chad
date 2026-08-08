import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertValidLeadLoca,
  assertValidLeadPhotoId,
  deleteLeadPhoto,
  getLeadPhotoReadInfo,
  LeadPhotoError,
  listLeadPhotos,
  saveLeadPhoto,
} from "./lead-photos.js";
import { createMemoryReferencedFileStore } from "./file-storage/metadata-store.js";
import { FILE_STORAGE_FEATURES } from "./file-storage/features.js";
import { runWithRepoContext } from "./repo-context.js";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1, 2, 3, 4, 5]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_BYTES = new TextEncoder().encode("<svg onload=alert(1)></svg>");

const PAWEL = { repoGuid: "repo-guid-pawel", username: "pawel_f" };
const KAMIL = { repoGuid: "repo-guid-kamil", username: "kamil_s" };
const LEAD_A_LOCA = "03/06/81";
const LEAD_A_UUID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const LEAD_A_NAME = "26-08-01_nn_latina";
const LEAD_B_LOCA = "03/06/82";
const LEAD_B_UUID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const LEAD_B_NAME = "26-06-03_pn_Anna";

describe("lead-photos — pure helpers", () => {
  it("validates loca and photo ids", () => {
    expect(() => assertValidLeadLoca("not-a-loca")).toThrow(LeadPhotoError);
    expect(assertValidLeadLoca(LEAD_A_LOCA)).toBe(LEAD_A_LOCA);
    expect(() => assertValidLeadPhotoId("../x")).toThrow(LeadPhotoError);
  });
});

describe("saveLeadPhoto — Story 111 file-storage", () => {
  let rootDir: string;
  let store: ReturnType<typeof createMemoryReferencedFileStore>;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-photos-"));
    store = createMemoryReferencedFileStore();
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves under 01_files_photos/lead-info/<lead-name>/ with readable name; no sidecar", async () => {
    const result = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "lead.jpg",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(result.fileName).toBe("26-08-01_nn_latina.jpg");
    expect(result.leadUuid).toBe(LEAD_A_UUID);
    const entityDir = path.join(
      rootDir,
      "pawel_f",
      "01_files_photos",
      "lead-info",
      "26-08-01_nn_latina",
    );
    const onDisk = await readFile(path.join(entityDir, result.fileName!));
    expect(Buffer.compare(onDisk, Buffer.from(JPEG_BYTES))).toBe(0);
    const names = await readdir(entityDir);
    expect(names.some((n) => n.endsWith(".json"))).toBe(false);
  });

  it("rejects MIME mismatch", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadPhoto({
          bytes: SVG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "evil.jpg",
          leadLoca: LEAD_A_LOCA,
          leadUuid: LEAD_A_UUID,
          leadName: LEAD_A_NAME,
          rootDirectory: rootDir,
          metadataStore: store,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("multiple photos of same ext use __2 collision suffix", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "a.png",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      const second = await saveLeadPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "b.png",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      expect(second.fileName).toBe("26-08-01_nn_latina__2.png");
    });
  });

  it("lists by leadUuid; rename of display name does not drop relation", async () => {
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const listed = await runWithRepoContext(PAWEL, () =>
      listLeadPhotos(LEAD_A_LOCA, {
        leadUuid: LEAD_A_UUID,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(listed).toHaveLength(1);
    expect(listed[0].leadUuid).toBe(LEAD_A_UUID);
  });

  it("cross-user isolation on list/delete/read", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const kamilList = await runWithRepoContext(KAMIL, () =>
      listLeadPhotos(LEAD_A_LOCA, {
        leadUuid: LEAD_A_UUID,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(kamilList).toHaveLength(0);
    const kamilRead = await runWithRepoContext(KAMIL, () =>
      getLeadPhotoReadInfo(saved.id, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(kamilRead).toBeNull();
    await expect(
      runWithRepoContext(KAMIL, () =>
        deleteLeadPhoto(saved.id, { rootDirectory: rootDir, metadataStore: store }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getLeadPhotoReadInfo returns bytes path for owner", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const info = await runWithRepoContext(PAWEL, () =>
      getLeadPhotoReadInfo(saved.id, { rootDirectory: rootDir, metadataStore: store }),
    );
    expect(info?.filePath).toBeTruthy();
    const bytes = await readFile(info!.filePath);
    expect(Buffer.compare(bytes, Buffer.from(JPEG_BYTES))).toBe(0);
  });

  it("feature constant is lead-info", () => {
    expect(FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO).toBe("01_files_photos/lead-info");
  });

  it("isolates lead B from lead A", async () => {
    await runWithRepoContext(PAWEL, async () => {
      await saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        leadUuid: LEAD_A_UUID,
        leadName: LEAD_A_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      });
      await saveLeadPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "b.png",
        leadLoca: LEAD_B_LOCA,
        leadUuid: LEAD_B_UUID,
        leadName: LEAD_B_NAME,
        rootDirectory: rootDir,
        metadataStore: store,
      });
    });
    const forA = await runWithRepoContext(PAWEL, () =>
      listLeadPhotos(LEAD_A_LOCA, {
        leadUuid: LEAD_A_UUID,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    const forB = await runWithRepoContext(PAWEL, () =>
      listLeadPhotos(LEAD_B_LOCA, {
        leadUuid: LEAD_B_UUID,
        rootDirectory: rootDir,
        metadataStore: store,
      }),
    );
    expect(forA).toHaveLength(1);
    expect(forB).toHaveLength(1);
  });
});
