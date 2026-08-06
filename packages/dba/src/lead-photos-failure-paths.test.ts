/**
 * Deterministic coverage for the two failure paths that are impractical to
 * force through the real filesystem (server-generated uuid filenames make
 * pre-seeding a collision non-deterministic) — mirrors
 * `google-contact-photos-failure-paths.test.ts`'s pattern for the separate
 * `lead-photos.ts` module (own `writeFile`/`rm` imports, not shared at
 * runtime even though the code path is structurally identical).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const control = {
  failOnWriteCall: -1, // 1-indexed writeFile call number to fail; -1 = never
  writeFileCallCount: 0,
  failRmForPath: null as string | null,
};

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    writeFile: vi.fn(async (target: Parameters<typeof actual.writeFile>[0], data: Parameters<typeof actual.writeFile>[1], opts: Parameters<typeof actual.writeFile>[2]) => {
      control.writeFileCallCount += 1;
      if (control.writeFileCallCount === control.failOnWriteCall) {
        throw Object.assign(new Error("simulated write failure"), { code: "EACCES" });
      }
      return actual.writeFile(target, data, opts);
    }),
    rm: vi.fn(async (target: Parameters<typeof actual.rm>[0], opts: Parameters<typeof actual.rm>[1]) => {
      if (control.failRmForPath && String(target) === control.failRmForPath) {
        throw Object.assign(new Error("simulated rm failure"), { code: "EACCES" });
      }
      return actual.rm(target, opts);
    }),
  };
});

const { mkdtemp, readdir, rm: realRm, stat } = await vi.importActual<typeof import("node:fs/promises")>(
  "node:fs/promises",
);
const { tmpdir } = await import("node:os");
const path = (await import("node:path")).default;
const { saveLeadPhoto, deleteLeadPhoto } = await import("./lead-photos.js");
const { getUserContactPhotosDir } = await import("./google-contact-photos.js");
const { runWithRepoContext } = await import("./repo-context.js");

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1]);
const USER = { repoGuid: "repo-fail", username: "user_fail" };

describe("saveLeadPhoto — metadata write failure", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-photos-fail-"));
    control.failOnWriteCall = -1;
    control.writeFileCallCount = 0;
    control.failRmForPath = null;
  });

  afterEach(async () => {
    await realRm(rootDir, { recursive: true, force: true });
  });

  it("removes the just-written photo file when the metadata sidecar write fails", async () => {
    control.failOnWriteCall = 2; // 1st writeFile = photo bytes (succeeds), 2nd = metadata (forced to fail)
    await expect(
      runWithRepoContext(USER, () =>
        saveLeadPhoto({
          bytes: JPEG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "a.jpg",
          leadLoca: "03/06/81",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const dir = getUserContactPhotosDir("user_fail", rootDir);
    const remaining = await readdir(dir).catch(() => []);
    expect(remaining).toEqual([]);
  });
});

describe("deleteLeadPhoto — file-delete failure", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-photos-fail-"));
    control.failOnWriteCall = -1;
    control.writeFileCallCount = 0;
    control.failRmForPath = null;
  });

  afterEach(async () => {
    await realRm(rootDir, { recursive: true, force: true });
  });

  it("aborts before deleting metadata when removing the photo file fails, leaving both intact for a retry", async () => {
    const saved = await runWithRepoContext(USER, () =>
      saveLeadPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        leadLoca: "03/06/81",
        rootDirectory: rootDir,
      }),
    );
    const dir = getUserContactPhotosDir("user_fail", rootDir);
    const filePath = path.join(dir, saved.storageKey);
    control.failRmForPath = filePath;

    await expect(
      runWithRepoContext(USER, () => deleteLeadPhoto(saved.id, { rootDirectory: rootDir })),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    await expect(stat(filePath)).resolves.toBeDefined();
    await expect(stat(path.join(dir, `${saved.id}.json`))).resolves.toBeDefined();
  });
});
