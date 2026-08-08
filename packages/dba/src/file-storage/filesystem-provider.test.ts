import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readdir, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFilesystemFileStorage } from "./filesystem-provider.js";
import { createMemoryReferencedFileStore } from "./metadata-store.js";
import { FILE_STORAGE_FEATURES } from "./features.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe("filesystem file-storage provider", () => {
  let rootDir: string;
  let store: ReturnType<typeof createMemoryReferencedFileStore>;
  let storage: ReturnType<typeof createFilesystemFileStorage>;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-fs-"));
    store = createMemoryReferencedFileStore();
    storage = createFilesystemFileStorage({ metadataStore: store });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("put/list/get/delete with compensation on metadata fail", async () => {
    const saved = await storage.putFile({
      bytes: PNG,
      repoGuid: "r1",
      ownerUsername: "test3",
      feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      entityType: "lead",
      entityId: "lead-1",
      entityNameSnapshot: "26-08-01_nn_latina",
      preferredFileNameStem: "26-08-01_nn_latina",
      ext: "png",
      mimeType: "image/png",
      rootDirectory: rootDir,
    });
    expect(saved.fileName).toBe("26-08-01_nn_latina.png");
    const listed = await storage.listFiles({
      repoGuid: "r1",
      ownerUsername: "test3",
      feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      entityId: "lead-1",
      rootDirectory: rootDir,
    });
    expect(listed).toHaveLength(1);
    const info = await storage.getFile(saved.id, "r1", { rootDirectory: rootDir });
    expect(info?.filePath).toBeTruthy();

    // Manual rename on disk → metadata fallback still finds + syncs name
    const dir = path.dirname(info!.filePath);
    await rename(info!.filePath, path.join(dir, "renamed-by-hand.png"));
    const afterRename = await storage.getFile(saved.id, "r1", { rootDirectory: rootDir });
    expect(afterRename?.fileName).toBe("renamed-by-hand.png");

    await storage.deleteFile(saved.id, "r1", { rootDirectory: rootDir });
    expect(await storage.getFile(saved.id, "r1", { rootDirectory: rootDir })).toBeNull();
  });

  it("metadata insert failure removes orphan file", async () => {
    const failing = {
      ...createMemoryReferencedFileStore(),
      async insert() {
        throw new Error("db down");
      },
    };
    const bad = createFilesystemFileStorage({ metadataStore: failing });
    await expect(
      bad.putFile({
        bytes: PNG,
        repoGuid: "r1",
        ownerUsername: "test3",
        feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
        entityType: "lead",
        entityId: "lead-1",
        entityNameSnapshot: "x",
        preferredFileNameStem: "x",
        ext: "png",
        rootDirectory: rootDir,
      }),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const entityDir = path.join(rootDir, "test3", "01_files_photos", "lead-info", "x");
    let names: string[] = [];
    try {
      names = await readdir(entityDir);
    } catch {
      names = [];
    }
    expect(names.filter((n) => n.endsWith(".png"))).toHaveLength(0);
  });

  it("cross-repo get returns null", async () => {
    const saved = await storage.putFile({
      bytes: PNG,
      repoGuid: "r1",
      ownerUsername: "test3",
      feature: FILE_STORAGE_FEATURES.PHOTOS_LEAD_INFO,
      entityType: "lead",
      entityId: "lead-1",
      entityNameSnapshot: "x",
      preferredFileNameStem: "x",
      ext: "png",
      rootDirectory: rootDir,
    });
    expect(await storage.getFile(saved.id, "other-repo", { rootDirectory: rootDir })).toBeNull();
    const bytes = await readFile(
      path.join(rootDir, "test3", "01_files_photos", "lead-info", "x", "x.png"),
    );
    expect(bytes.byteLength).toBe(PNG.byteLength);
  });
});
