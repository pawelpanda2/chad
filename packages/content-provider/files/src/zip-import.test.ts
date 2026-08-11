/**
 * Pure fixture-based tests for the ZIP import validator/parser (Story 109).
 * No I/O beyond a real temp directory this test itself owns and always
 * removes — no DB, no real user session. Fixtures are built in-memory with
 * `yazl` (yauzl's sibling "write" library), not checked-in binary files.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import yazl from "yazl";
import { DEFAULT_IMPORT_LIMITS, stageAndValidateZipImport } from "./zip-import.js";

interface ZipFileSpec {
  path: string;
  content: string;
}

function buildZip(files: ZipFileSpec[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const file of files) {
    zip.addBuffer(Buffer.from(file.content, "utf8"), file.path);
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
    zip.end();
  });
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (~crc) >>> 0;
}

/**
 * Builds a minimal single-entry STORED-method ZIP with a raw, unvalidated
 * filename — bypasses `yazl`'s own path-safety checks so a malicious entry
 * name (absolute path, `..`) can reach this module's own validator in a
 * test, exactly as a hostile ZIP would.
 */
function buildRawStoredZipSingleEntry(filenameRaw: string, content: string): Buffer {
  const nameBuf = Buffer.from(filenameRaw, "utf8");
  const dataBuf = Buffer.from(content, "utf8");
  const crc = crc32(dataBuf);

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt16LE(0, 10);
  local.writeUInt16LE(0, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(dataBuf.length, 18);
  local.writeUInt32LE(dataBuf.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt16LE(0, 12);
  central.writeUInt16LE(0, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(dataBuf.length, 20);
  central.writeUInt32LE(dataBuf.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30);
  central.writeUInt16LE(0, 32);
  central.writeUInt16LE(0, 34);
  central.writeUInt16LE(0, 36);
  central.writeUInt32LE(0, 38);
  central.writeUInt32LE(0, 42);
  nameBuf.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + dataBuf.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([local, dataBuf, central, eocd]);
}

/** Sets the general-purpose bit-flag's encryption bit (bit 0) on `entryName`'s central-directory record. */
function markEntryEncrypted(zipBuf: Buffer, entryName: string): Buffer {
  return patchCentralDirRecord(zipBuf, entryName, (buf, recordStart) => {
    const flag = buf.readUInt16LE(recordStart + 8);
    buf.writeUInt16LE(flag | 0x1, recordStart + 8);
  });
}

/** Sets `entryName`'s central-directory record to look like a Unix symlink (mode S_IFLNK, host OS = Unix). */
function markEntryAsSymlink(zipBuf: Buffer, entryName: string): Buffer {
  return patchCentralDirRecord(zipBuf, entryName, (buf, recordStart) => {
    const versionMadeBy = buf.readUInt16LE(recordStart + 4);
    buf.writeUInt16LE((3 << 8) | (versionMadeBy & 0xff), recordStart + 4); // host OS byte = 3 (Unix)
    const symlinkMode = 0xa1ff; // S_IFLNK | 0777
    buf.writeUInt32LE((symlinkMode << 16) >>> 0, recordStart + 38);
  });
}

function patchCentralDirRecord(zipBuf: Buffer, entryName: string, patch: (buf: Buffer, recordStart: number) => void): Buffer {
  const buf = Buffer.from(zipBuf); // copy — never mutate the caller's buffer
  const sig = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  let offset = 0;
  let found = false;
  while (offset < buf.length - 4) {
    const idx = buf.indexOf(sig, offset);
    if (idx === -1) break;
    const nameLen = buf.readUInt16LE(idx + 28);
    const name = buf.toString("utf8", idx + 46, idx + 46 + nameLen);
    if (name === entryName) {
      patch(buf, idx);
      found = true;
      break;
    }
    offset = idx + 46 + nameLen;
  }
  if (!found) throw new Error(`patchCentralDirRecord: entry "${entryName}" not found in test zip fixture`);
  return buf;
}

async function withStagingDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "cp-zip-import-test-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const validConfig = (overrides: Record<string, unknown> = {}) =>
  ["id: placeholder-id", "type: Folder", "name: placeholder-name", "address: placeholder-address", ...Object.entries(overrides).map(([k, v]) => `${k}: ${JSON.stringify(v)}`)].join(
    "\n"
  );

describe("stageAndValidateZipImport — valid fixtures", () => {
  it("accepts a single root Folder with no children", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.type).toBe("Folder");
        expect(result.plan.root.name).toBe("Root");
        expect(result.plan.root.children).toEqual([]);
        expect(result.plan.totalItemCount).toBe(1);
      }
    });
  });

  it("accepts a Folder with a Text child", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Text\nname: Child\naddress: y" },
      { path: "01/02/body.txt", content: "hello world" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.children).toHaveLength(1);
        expect(result.plan.root.children[0]).toMatchObject({ type: "Text", name: "Child", body: "hello world" });
        expect(result.plan.totalItemCount).toBe(2);
      }
    });
  });

  it("accepts a nested Folder tree with 2-digit and 3-digit indices", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/100/config.yaml", content: "id: b\ntype: Folder\nname: Mid\naddress: y" },
      { path: "01/100/102/config.yaml", content: "id: c\ntype: Text\nname: Leaf\naddress: z" },
      { path: "01/100/102/body.txt", content: "leaf body" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.children[0].name).toBe("Mid");
        expect(result.plan.root.children[0].children[0].name).toBe("Leaf");
        expect(result.plan.totalItemCount).toBe(3);
      }
    });
  });

  it("accepts a Folder with no body.txt (Folders never carry one)", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
    });
  });

  it("preserves extra safe config.yaml fields, excludes id/address/type/name from extraConfig", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x\ncustomField: hello\nnested:\n  a: 1" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.extraConfig).toEqual({ customField: "hello", nested: { a: 1 } });
      }
    });
  });

  it("accepts a config.yaml with no address field (real .NET exports commonly omit it — self-healed on read, never trusted anyway)", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.plan.root.name).toBe("Root");
    });
  });

  it("ignores a __MACOSX sibling directory (macOS Finder Compress byproduct) instead of treating it as a second root", async () => {
    const zip = await buildZip([
      { path: "14/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "14/02/config.yaml", content: "id: b\ntype: Text\nname: Child\naddress: y" },
      { path: "14/02/body.txt", content: "hi" },
      { path: "__MACOSX/14/._config.yaml", content: "AppleDouble junk" },
      { path: "__MACOSX/14/02/._config.yaml", content: "AppleDouble junk" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.name).toBe("Root");
        expect(result.plan.totalItemCount).toBe(2);
      }
    });
  });

  it("ignores .DS_Store files inside item directories instead of rejecting them as unexpected", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/.DS_Store", content: "finder metadata junk" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
    });
  });

  it("strips a single non-numeric technical wrapper directory", async () => {
    const zip = await buildZip([
      { path: "MyExport/01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "MyExport/01/02/config.yaml", content: "id: b\ntype: Text\nname: Child\naddress: y" },
      { path: "MyExport/01/02/body.txt", content: "hi" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.name).toBe("Root");
        expect(result.plan.root.children).toHaveLength(1);
      }
    });
  });
});

describe("stageAndValidateZipImport — invalid fixtures", () => {
  it("rejects an archive with zero root items", async () => {
    const zip = await buildZip([]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("NO_ROOT_ITEM");
    });
  });

  it("rejects an archive with two sibling root items", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: RootA\naddress: x" },
      { path: "02/config.yaml", content: "id: b\ntype: Folder\nname: RootB\naddress: y" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("MULTIPLE_ROOT_ITEMS");
    });
  });

  it.each(["1", "abc", "01a", "0001"])("rejects bad root folder name %s", async (badName) => {
    const zip = await buildZip([{ path: `${badName}/config.yaml`, content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
    });
  });

  it("rejects an unexpected file alongside config.yaml", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/notes.txt", content: "not allowed" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.code === "UNEXPECTED_FILE")).toBe(true);
    });
  });

  it("rejects a missing config.yaml", async () => {
    const zip = await buildZip([{ path: "01/body.txt", content: "orphan body" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
    });
  });

  it("rejects a broken (unparsable) config.yaml", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: [unterminated" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("INVALID_CONFIG");
    });
  });

  it('rejects an unsupported type ("Ref")', async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Ref\nname: Root\naddress: x\nrefAddress: y" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("UNSUPPORTED_TYPE");
    });
  });

  it("rejects a Text item missing body.txt", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Text\nname: Child\naddress: y" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.code === "MISSING_BODY")).toBe(true);
    });
  });

  it("rejects a Folder item that carries body.txt", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/body.txt", content: "folders don't have bodies" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.code === "UNEXPECTED_FILE")).toBe(true);
    });
  });

  it("rejects path traversal (../evil)", async () => {
    // yazl itself refuses to build a "../"-containing entry, exactly like a well-behaved
    // zip tool would — so a hostile archive has to be constructed by hand to reach our
    // own validator, same as a real attacker's crafted ZIP would.
    const zip = buildRawStoredZipSingleEntry("01/../evil/config.yaml", "id: a\ntype: Folder\nname: Evil\naddress: x");
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(["ZIP_SLIP", "MALFORMED_ENTRY_PATH"]).toContain(result.errors[0].code);
    });
  });

  it("rejects an absolute path entry", async () => {
    const zip = buildRawStoredZipSingleEntry("/etc/passwd", "nope");
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("ABSOLUTE_PATH_ENTRY");
    });
  });

  it("rejects a symlink entry", async () => {
    const rawZip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    const zip = markEntryAsSymlink(rawZip, "01/config.yaml");
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("SYMLINK_OR_SPECIAL_ENTRY");
    });
  });

  it("rejects an encrypted entry", async () => {
    const rawZip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    const zip = markEntryEncrypted(rawZip, "01/config.yaml");
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("ENCRYPTED_ENTRY");
    });
  });

  it("rejects an archive exceeding the entry-count limit", async () => {
    const files: ZipFileSpec[] = [{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }];
    for (let i = 0; i < 5; i++) {
      files.push({ path: `01/${(i + 2).toString().padStart(2, "0")}/config.yaml`, content: `id: c${i}\ntype: Folder\nname: C${i}\naddress: z${i}` });
    }
    const zip = await buildZip(files);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip, limits: { maxEntries: 3 } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("TOO_MANY_ENTRIES");
    });
  });

  it("rejects an entry exceeding maxEntryUncompressedBytes (zip-bomb-style defense)", async () => {
    const bigContent = "a".repeat(1000);
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Text\nname: Child\naddress: y" },
      { path: "01/02/body.txt", content: bigContent },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip, limits: { maxEntryUncompressedBytes: 100 } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("ENTRY_TOO_LARGE");
    });
  });

  it("rejects an archive whose total ZIP size exceeds maxZipBytes without opening it", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip, limits: { maxZipBytes: 10 } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("ARCHIVE_TOO_LARGE");
    });
  });
});

describe("stageAndValidateZipImport — cleanup + name validation", () => {
  it("removes the staging directory after a PASS", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      await expect(import("node:fs/promises").then((fs) => fs.stat(dir))).rejects.toThrow();
    });
  });

  it("removes the staging directory after a validation FAIL", async () => {
    const zip = await buildZip([]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      await expect(import("node:fs/promises").then((fs) => fs.stat(dir))).rejects.toThrow();
    });
  });

  it("accepts an item name containing '/' or '\\' — a real user export legitimately has these (e.g. \"pomysły / todo\"), name is a display label never used to build a path", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: 'id: a\ntype: Folder\nname: "pomysły / todo"\naddress: x' }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.plan.root.name).toBe("pomysły / todo");
    });
  });

  it("accepts an item name containing '..' — display label only; real titles end with ellipsis-like '..'", async () => {
    const zip = await buildZip([
      {
        path: "01/config.yaml",
        content:
          'id: a\ntype: Folder\nname: "#420 Jak Nauczyć Się Rzeczy, Których Nie Chcesz Robić.."\naddress: x',
      },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.name).toBe("#420 Jak Nauczyć Się Rzeczy, Których Nie Chcesz Robić..");
      }
    });
  });

  it("still rejects an empty / whitespace-only item name", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: 'id: a\ntype: Folder\nname: "   "\naddress: x' }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      // Empty-after-trim fails the required-fields check (INVALID_CONFIG), not a separate name rule.
      if (!result.ok) expect(result.errors[0].code).toBe("INVALID_CONFIG");
    });
  });

  it("default limits are sane (documented values in force)", () => {
    expect(DEFAULT_IMPORT_LIMITS.maxZipBytes).toBeGreaterThan(0);
    expect(DEFAULT_IMPORT_LIMITS.maxItemCount).toBeGreaterThan(0);
  });
});

describe("stageAndValidateZipImport — skipPolicy (opt-in only, found via a real user archive)", () => {
  it("without skipPolicy, a Ref item still hard-fails the whole import (default behavior unchanged)", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Ref\nname: Alias\naddress: y\nrefAddress: z" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.code === "UNSUPPORTED_TYPE")).toBe(true);
    });
  });

  it("with skipRefItems, a Ref item is skipped (not imported) instead of failing the import", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Ref\nname: Alias\naddress: y\nrefAddress: z" },
      { path: "01/03/config.yaml", content: "id: c\ntype: Text\nname: Kept\naddress: w" },
      { path: "01/03/body.txt", content: "still here" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip, skipPolicy: { skipRefItems: true } });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.children).toHaveLength(1);
        expect(result.plan.root.children[0].name).toBe("Kept");
        expect(result.skipped).toEqual([{ code: "REF_ITEM_SKIPPED", path: "01/02", message: expect.stringContaining("Alias") }]);
      }
    });
  });

  it("without skipPolicy, an unexpected .wav file still hard-fails the whole import (default behavior unchanged)", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/lista.wav", content: "binary-ish" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.some((e) => e.code === "UNEXPECTED_FILE")).toBe(true);
    });
  });

  it("with skipUnexpectedFileExtensions, a matching extra file is skipped but the item itself is still imported", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/lista.wav", content: "binary-ish" },
      { path: "01/notes.txt.bak", content: "old backup" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({
        stagingDir: dir,
        zipBytes: zip,
        skipPolicy: { skipUnexpectedFileExtensions: ["wav", "bak"] },
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.plan.root.name).toBe("Root");
        expect(result.skipped).toHaveLength(2);
        expect(result.skipped.map((s) => s.code)).toEqual(["UNEXPECTED_FILE_SKIPPED", "UNEXPECTED_FILE_SKIPPED"]);
      }
    });
  });

  it("a skip policy does not rescue a mix that also contains a non-skippable error", async () => {
    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Root\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Ref\nname: Alias\naddress: y" },
      { path: "01/03/config.yaml", content: "id: c\ntype: Widget\nname: BadType\naddress: w" },
    ]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({
        stagingDir: dir,
        zipBytes: zip,
        skipPolicy: { skipRefItems: true, skipUnexpectedFileExtensions: ["wav", "bak"] },
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.some((e) => e.code === "UNSUPPORTED_TYPE" && e.message.includes("Widget"))).toBe(true);
        // Ref was skipped via policy — no hard error whose path is the Ref item.
        expect(result.errors.some((e) => e.path === "01/02")).toBe(false);
      }
    });
  });

  it("skipping the ROOT item itself (a Ref at the top level) fails clearly instead of returning an empty plan", async () => {
    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Ref\nname: Root\naddress: x" }]);
    await withStagingDir(async (dir) => {
      const result = await stageAndValidateZipImport({ stagingDir: dir, zipBytes: zip, skipPolicy: { skipRefItems: true } });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0].code).toBe("ROOT_ITEM_SKIPPED");
    });
  });
});
