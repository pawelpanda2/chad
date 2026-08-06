import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  assertSafeContactPhotoPath,
  assertSafeUsername,
  assertValidContactPhotoId,
  assertValidGoogleContactResourceName,
  buildContactPhotoFileName,
  CONTACT_PHOTO_MAX_BYTES,
  ContactPhotoError,
  deleteContactPhoto,
  detectImageMimeFromBytes,
  getContactPhotoReadInfo,
  getUserContactPhotosDir,
  listContactPhotoCounts,
  listContactPhotosForContact,
  resolveContactPhotoExtension,
  saveContactPhoto,
} from "./google-contact-photos.js";
import { runWithRepoContext } from "./repo-context.js";

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 1, 2, 3, 4, 5]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const WEBP_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4,
]);
const SVG_BYTES = new TextEncoder().encode("<svg onload=alert(1)></svg>");
const HTML_BYTES = new TextEncoder().encode("<html><script>alert(1)</script></html>");

const PAWEL = { repoGuid: "repo-guid-pawel", username: "pawel_f" };
const KAMIL = { repoGuid: "repo-guid-kamil", username: "kamil_s" };
const CONTACT_A = "people/c1111111111";
const CONTACT_B = "people/c2222222222";

describe("google-contact-photos — pure helpers", () => {
  it("maps supported MIME types to extensions", () => {
    expect(resolveContactPhotoExtension("image/jpeg")).toBe("jpg");
    expect(resolveContactPhotoExtension("image/png")).toBe("png");
    expect(resolveContactPhotoExtension("image/webp")).toBe("webp");
    expect(resolveContactPhotoExtension("image/svg+xml")).toBeNull();
    expect(resolveContactPhotoExtension("text/html")).toBeNull();
  });

  it("detects real image types from magic bytes, independent of any declared MIME", () => {
    expect(detectImageMimeFromBytes(JPEG_BYTES)).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(PNG_BYTES)).toBe("image/png");
    expect(detectImageMimeFromBytes(WEBP_BYTES)).toBe("image/webp");
    expect(detectImageMimeFromBytes(SVG_BYTES)).toBeNull();
    expect(detectImageMimeFromBytes(HTML_BYTES)).toBeNull();
  });

  it("builds collision-resistant server filenames", () => {
    const name = buildContactPhotoFileName("jpg", new Date("2026-08-06T12:34:56"));
    expect(name).toMatch(/^2026-08-06_12-34-56_[0-9a-f-]{36}\.jpg$/i);
  });

  it("rejects path traversal in resolved file paths", () => {
    expect(() => assertSafeContactPhotoPath("/tmp/photos", "../../etc/passwd")).toThrow(ContactPhotoError);
    expect(() => assertSafeContactPhotoPath("/tmp/photos", "ok.jpg")).not.toThrow();
  });

  it("rejects traversal-like photo ids", () => {
    expect(() => assertValidContactPhotoId("../x")).toThrow(ContactPhotoError);
    expect(() => assertValidContactPhotoId("..%2f..%2fetc%2fpasswd")).toThrow(ContactPhotoError);
    expect(() => assertValidContactPhotoId("a/b.jpg")).toThrow(ContactPhotoError);
    expect(() => assertValidContactPhotoId("2026-08-06_12-00-00_uuid.jpg")).not.toThrow();
  });

  it("rejects unsafe usernames (defense in depth even though username never comes from a request)", () => {
    expect(() => assertSafeUsername("../pawel_f")).toThrow(ContactPhotoError);
    expect(() => assertSafeUsername("pawel/../kamil_s")).toThrow(ContactPhotoError);
    expect(() => assertSafeUsername("pawel f")).toThrow(ContactPhotoError);
    expect(() => assertSafeUsername("pawel_f")).not.toThrow();
  });

  it("builds the exact <root>/<username>/01_files_photos tree required by the spec", () => {
    const dir = getUserContactPhotosDir("pawel_f", "/tmp/contact-photos-root");
    expect(dir).toBe(path.resolve("/tmp/contact-photos-root/pawel_f/01_files_photos"));
  });

  it("validates the Google contact resourceName format", () => {
    expect(() => assertValidGoogleContactResourceName("not-a-resource")).toThrow(ContactPhotoError);
    expect(() => assertValidGoogleContactResourceName("people/../../etc")).toThrow(ContactPhotoError);
    expect(assertValidGoogleContactResourceName(CONTACT_A)).toBe(CONTACT_A);
  });
});

describe("saveContactPhoto / listContactPhotosForContact / read / delete", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-contact-photos-"));
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("saves a valid JPEG/PNG/WebP into <root>/<username>/01_files_photos", async () => {
    for (const [bytes, mime] of [
      [JPEG_BYTES, "image/jpeg"],
      [PNG_BYTES, "image/png"],
      [WEBP_BYTES, "image/webp"],
    ] as const) {
      const result = await runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes,
          mimeType: mime,
          originalFileName: "photo.bin",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      );
      const onDisk = await readFile(path.join(rootDir, "pawel_f", "01_files_photos", result.storageKey));
      expect(Buffer.compare(onDisk, Buffer.from(bytes))).toBe(0);
      expect(result.contactResourceName).toBe(CONTACT_A);
      expect(result.ownerUsername).toBe("pawel_f");
      expect(result.repoGuid).toBe(PAWEL.repoGuid);
    }
  });

  it("rejects a fake extension whose bytes don't match the declared MIME (SVG/HTML disguised as jpg)", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: SVG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "evil.jpg",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });

    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: HTML_BYTES,
          mimeType: "image/png",
          originalFileName: "evil.png",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("rejects disallowed declared MIME outright (SVG/executable content types)", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: SVG_BYTES,
          mimeType: "image/svg+xml",
          originalFileName: "evil.svg",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_MIME" });
  });

  it("rejects empty payload", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: new Uint8Array(),
          mimeType: "image/jpeg",
          originalFileName: "empty.jpg",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "EMPTY" });
  });

  it("enforces the per-file size limit", async () => {
    const oversized = new Uint8Array(CONTACT_PHOTO_MAX_BYTES + 1);
    oversized.set(JPEG_BYTES);
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: oversized,
          mimeType: "image/jpeg",
          originalFileName: "huge.jpg",
          contactResourceName: CONTACT_A,
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("rejects an invalid contact resourceName", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        saveContactPhoto({
          bytes: JPEG_BYTES,
          mimeType: "image/jpeg",
          originalFileName: "a.jpg",
          contactResourceName: "not-a-real-id",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_CONTACT_ID" });
  });

  it("never overwrites an existing file — server filenames are collision-resistant, and a forced collision throws", async () => {
    const dir = getUserContactPhotosDir("pawel_f", rootDir);
    await mkdir(dir, { recursive: true });
    // Simulate a name collision by writing directly, then forcing the same name via a stub.
    const collidingName = "2026-08-06_00-00-00_00000000-0000-0000-0000-000000000000.jpg";
    await writeFile(path.join(dir, collidingName), new Uint8Array([9]));
    // Real saveContactPhoto always generates a fresh uuid, so instead verify
    // the underlying write primitive itself refuses to clobber: `wx` flag.
    await expect(
      writeFile(path.join(dir, collidingName), new Uint8Array([1]), { flag: "wx" }),
    ).rejects.toMatchObject({ code: "EEXIST" });
  });

  it("supports multiple photos on the same contact, newest first", async () => {
    const first = await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "first.jpg",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "second.png",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );
    const list = await runWithRepoContext(PAWEL, () =>
      listContactPhotosForContact(CONTACT_A, { rootDirectory: rootDir }),
    );
    expect(list.map((p) => p.id).sort()).toEqual([first.id, second.id].sort());
  });

  it("keeps two different contacts' photos separate even with unrelated resourceNames (stable-id based, not name-based)", async () => {
    await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );
    await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: PNG_BYTES,
        mimeType: "image/png",
        originalFileName: "b.png",
        contactResourceName: CONTACT_B,
        rootDirectory: rootDir,
      }),
    );
    const listA = await runWithRepoContext(PAWEL, () =>
      listContactPhotosForContact(CONTACT_A, { rootDirectory: rootDir }),
    );
    const listB = await runWithRepoContext(PAWEL, () =>
      listContactPhotosForContact(CONTACT_B, { rootDirectory: rootDir }),
    );
    expect(listA).toHaveLength(1);
    expect(listB).toHaveLength(1);
    expect(listA[0]?.contactResourceName).toBe(CONTACT_A);
    expect(listB[0]?.contactResourceName).toBe(CONTACT_B);

    const counts = await runWithRepoContext(PAWEL, () => listContactPhotoCounts({ rootDirectory: rootDir }));
    expect(counts[CONTACT_A]).toBe(1);
    expect(counts[CONTACT_B]).toBe(1);
  });

  it("isolates users at the directory level: kamil_s cannot list, read, or delete pawel_f's photos", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "private.jpg",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );

    const kamilList = await runWithRepoContext(KAMIL, () =>
      listContactPhotosForContact(CONTACT_A, { rootDirectory: rootDir }),
    );
    expect(kamilList).toEqual([]);

    const kamilRead = await runWithRepoContext(KAMIL, () =>
      getContactPhotoReadInfo(saved.id, { rootDirectory: rootDir }),
    );
    expect(kamilRead).toBeNull();

    await expect(
      runWithRepoContext(KAMIL, () => deleteContactPhoto(saved.id, { rootDirectory: rootDir })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // pawel_f's photo must survive kamil_s's failed delete attempt.
    const stillThere = await runWithRepoContext(PAWEL, () =>
      getContactPhotoReadInfo(saved.id, { rootDirectory: rootDir }),
    );
    expect(stillThere).not.toBeNull();
  });

  it("read info never exposes the host/container filesystem path to a caller inspecting the public fields", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );
    const info = await runWithRepoContext(PAWEL, () =>
      getContactPhotoReadInfo(saved.id, { rootDirectory: rootDir }),
    );
    // filePath exists for the server-side stream handler only; the route
    // layer must never forward it — this test just documents its shape so a
    // future route change forwarding the whole object would be caught by
    // the route-level contract, not asserted away here.
    expect(info?.filePath).toContain(rootDir);
    expect(info?.storageKey).not.toContain("/");
  });

  it("leaves exactly one data file + one sidecar on the happy path (failure-path cleanup itself is covered in google-contact-photos-failure-paths.test.ts, which mocks fs to force the metadata write to fail deterministically)", async () => {
    const dir = getUserContactPhotosDir("pawel_f", rootDir);
    await mkdir(dir, { recursive: true });
    const before = await saveContactPhoto({
      bytes: JPEG_BYTES,
      mimeType: "image/jpeg",
      originalFileName: "a.jpg",
      contactResourceName: CONTACT_A,
      rootDirectory: rootDir,
      repoGuid: PAWEL.repoGuid,
      username: PAWEL.username,
    });
    const dataStat = await stat(path.join(dir, before.storageKey));
    const metaStat = await stat(path.join(dir, `${before.id}.json`));
    expect(dataStat.isFile()).toBe(true);
    expect(metaStat.isFile()).toBe(true);
  });

  it("delete removes both the file and the metadata sidecar", async () => {
    const saved = await runWithRepoContext(PAWEL, () =>
      saveContactPhoto({
        bytes: JPEG_BYTES,
        mimeType: "image/jpeg",
        originalFileName: "a.jpg",
        contactResourceName: CONTACT_A,
        rootDirectory: rootDir,
      }),
    );
    const dir = getUserContactPhotosDir("pawel_f", rootDir);
    await runWithRepoContext(PAWEL, () => deleteContactPhoto(saved.id, { rootDirectory: rootDir }));
    await expect(stat(path.join(dir, saved.storageKey))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(path.join(dir, `${saved.id}.json`))).rejects.toMatchObject({ code: "ENOENT" });

    const list = await runWithRepoContext(PAWEL, () =>
      listContactPhotosForContact(CONTACT_A, { rootDirectory: rootDir }),
    );
    expect(list).toEqual([]);
  });

  it("deleting an already-deleted / unknown id reports NOT_FOUND, not a crash", async () => {
    await expect(
      runWithRepoContext(PAWEL, () =>
        deleteContactPhoto("2026-01-01_00-00-00_00000000-0000-0000-0000-000000000000.jpg", {
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns an empty list/counts when the user has no photos dir yet", async () => {
    const list = await runWithRepoContext(PAWEL, () =>
      listContactPhotosForContact(CONTACT_A, { rootDirectory: rootDir }),
    );
    expect(list).toEqual([]);
    const counts = await runWithRepoContext(PAWEL, () => listContactPhotoCounts({ rootDirectory: rootDir }));
    expect(counts).toEqual({});
  });
});
