/**
 * Metadata-write failure cleans up the orphan archive file (Photos pattern).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const control = {
  failOnWriteCall: -1,
  writeFileCallCount: 0,
};

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    writeFile: vi.fn(async (
      target: Parameters<typeof actual.writeFile>[0],
      data: Parameters<typeof actual.writeFile>[1],
      opts: Parameters<typeof actual.writeFile>[2],
    ) => {
      control.writeFileCallCount += 1;
      if (control.writeFileCallCount === control.failOnWriteCall) {
        throw Object.assign(new Error("simulated write failure"), { code: "EACCES" });
      }
      return actual.writeFile(target, data, opts);
    }),
  };
});

const { mkdtemp, readdir, rm: realRm } = await vi.importActual<typeof import("node:fs/promises")>(
  "node:fs/promises",
);
const { tmpdir } = await import("node:os");
const path = (await import("node:path")).default;
const { saveLeadArchive } = await import("./lead-archives.js");
const { getUserLeadArchivesDir } = await import("./lead-archives.js");
const { runWithRepoContext } = await import("./repo-context.js");

const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const USER = { repoGuid: "repo-fail", username: "user_fail" };

describe("saveLeadArchive — metadata write failure", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "chad-lead-archives-fail-"));
    control.failOnWriteCall = -1;
    control.writeFileCallCount = 0;
  });

  afterEach(async () => {
    await realRm(rootDir, { recursive: true, force: true });
  });

  it("filesystem PASS + metadata FAIL → removes orphan file", async () => {
    // 1st writeFile = archive bytes, 2nd = metadata JSON
    control.failOnWriteCall = 2;
    await expect(
      runWithRepoContext(USER, () =>
        saveLeadArchive({
          bytes: ZIP_BYTES,
          originalFileName: "x.zip",
          leadLoca: "03/06/81",
          rootDirectory: rootDir,
        }),
      ),
    ).rejects.toMatchObject({ code: "WRITE_FAILED" });

    const dir = getUserLeadArchivesDir("user_fail", rootDir);
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      names = [];
    }
    expect(names.filter((n) => n.endsWith(".zip") || n.endsWith(".json"))).toHaveLength(0);
  });
});
