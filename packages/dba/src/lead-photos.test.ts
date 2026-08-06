import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
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
import { getUserContactPhotosDir } from "./google-contact-photos.js";
import { runWithRepoContext } from "./repo-context.js";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1, 2, 3, 4, 5]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const SVG_BYTES = new TextEncoder().encode("<svg onload=alert(1)></svg>");

const PAWEL = { repoGuid: "repo-guid-pawel", username: "pawel_f" };
const KAMIL = { repoGuid: "repo-guid-kamil", username: "kamil_s" };
const LEAD_A_LOCA = "03/06/81";
const LEAD_B_LOCA = "03/06/82";

describe("lead-photos — pure helpers", () => {
  it("validates a lead's numeric loca, rejecting names/traversal", () => {
    expect(() => assertValidLeadLoca("not-a-loca")).toThrow(LeadPhotoError);
    expect(() => assertValidLeadLoca("../../etc/passwd")).toThrow(LeadPhotoError);
    expect(() => assertValidLeadLoca("03/06/../81")).toThrow(LeadPhotoError);
    expect(assertValidLeadLoca(LEAD_A_LOCA)).toBe(LEAD_A_LOCA);
  });

  it("rejects traversal-like photo ids", () => {
    expect(() => assertValidLeadPhotoId("../x")).toThrow(LeadPhotoError);
    expect(() => assertValidLeadPhotoId("a/b.jpg")).toThrow(LeadPhotoError);
    expect(() => assertValidLeadPhotoId("2026-08-06_12-00-00_uuid.jpg")).not.toThrow();
  });
});

describe("saveLeadPhoto / listLeadPhotos / read / delete", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-photos-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves into the same <root>/<username>/01_files_photos tree as Google Contacts photos", async () => {
    const result = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "lead.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    const dir = getUserContactPhotosDir("pawel_f", rootDir);
    const onDisk = await readFile(path.join(dir, result.storageKey));
    expect(Buffer.compare(onDisk, Buffer.from(JPEG_BYTES))).toBe(0);
    expect(result.leadLoca).toBe(LEAD_A_LOCA);
    expect(result.ownerUsername).toBe("pawel_f");
  });

  it("rejects content that doesn't match the declared MIME (fake extension)", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadPhoto({
          bytes: SVG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "evil.jpg",
          leadLoca: LEAD_A_LOCA,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("rejects an invalid lead loca", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveLeadPhoto({
          bytes: JPEG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "a.jpg",
          leadLoca: "not-a-real-loca",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_LEAD_LOCA" });
  });

  it("keeps two different leads' photos separate, even by stable loca not name", async () => {
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "b.png",
        leadLoca: LEAD_B_LOCA,
        rootDirectory: rootDir,
      }),
    );
    const listA = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    const listB = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_B_LOCA, { rootDirectory: rootDir }));
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0]?.leadLoca).toBe(LEAD_A_LOCA);
    expect(listB[0]?.leadLoca).toBe(LEAD_B_LOCA);
  });

  it("supports multiple photos on the same lead", async () => {
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "first.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "second.png",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    const list = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    expect(list).toHaveLength(2);
  });

  it("isolates users at the directory level: kamil_s cannot list, read, or delete pawel_f's lead photos", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "private.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );

    const kamilList = await runWithRepoContext(KAMIL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    expect(kamilList).toEqual([]);

    const kamilRead = await runWithRepoContext(KAMIL, () =>
      getLeadPhotoReadInfo(saved.id, { rootDirectory: rootDir }),
    );
    expect(kamilRead).toBeNull();

    await expect(
      runWithRepoContext(KAMIL, () => deleteLeadPhoto(saved.id, { rootDirectory: rootDir })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const stillThere = await runWithRepoContext(PAWEL, () =>
      getLeadPhotoReadInfo(saved.id, { rootDirectory: rootDir }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("does not leak another lead's photos when listing an unrelated loca", async () => {
    await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    const list = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_B_LOCA, { rootDirectory: rootDir }));
    expect(list).toEqual([]);
  });

  it("delete removes both the file and metadata sidecar, and persists across a fresh list call (survives 'refresh')", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: LEAD_A_LOCA,
        rootDirectory: rootDir,
      }),
    );
    const dir = getUserContactPhotosDir("pawel_f", rootDir);

    // Persistence check first — a second, independent list call (simulating
    // a page refresh) must still see it before it's deleted.
    const beforeDelete = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    expect(beforeDelete).toHaveLength(1);

    await runWithRepoContext(PAWEL, () => deleteLeadPhoto(saved.id, { rootDirectory: rootDir }));
    await expect(stat(path.join(dir, saved.storageKey))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(dir, `${saved.id}.json`))).rejects.toMatchObject({ code: "ENOENT" });

    const afterDelete = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    expect(afterDelete).toEqual([]);
  });

  it("returns an empty list for a lead with no photos yet", async () => {
    const list = await runWithRepoContext(PAWEL, () => listLeadPhotos(LEAD_A_LOCA, { rootDirectory: rootDir }));
    expect(list).toEqual([]);
  });
});
