/**
 * Real-Postgres end-to-end test for the ZIP Folder import feature (Story
 * 109) — exercises the full Dashboard-relevant path: dba's
 * `importCpFolderFromZip` -> cp-entry's `importFolderFromZip` -> cp-files
 * (real staging/unzip/validate under a real temp dir) -> cp-postgre (real
 * transactional commit), against the same local throwaway Postgres
 * `leads-postgres.test.ts` uses. Covers atomicity (nothing partial on
 * FAIL), cleanup (staging dir never lingers), conflicts, and cross-user
 * isolation.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

process.env.POSTGRES_URI = process.env.POSTGRES_URI ?? "postgres://chad:3662dfbcb4c2e9b439971406856b78e3@localhost:5433/chad_test_story109_import";
process.env.CP_POSTGRE_URI = process.env.POSTGRES_URI;
process.env.DBA_PRIMARY_BACKEND = "postgres";
process.env.DBA_POSTGRES_ENABLED = "true";
process.env.DBA_MONGO_ENABLED = "false";
process.env.DBA_CONTENT_PROVIDER_ENABLED = "false";
process.env.CP_DEFAULT_BACKEND = "postgre";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import yazl from "yazl";
import { withPostgresClient, closePostgresConnection } from "./postgres.js";
import { runWithRepoContext } from "./repo-context.js";
import { importCpFolderFromZip, CpImportError } from "./cp-import.js";

let contactPhotosRoot: string;

interface ZipFileSpec {
  path: string;
  content: string;
}

function buildZip(files: ZipFileSpec[]): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  for (const file of files) zip.addBuffer(Buffer.from(file.content, "utf8"), file.path);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
    zip.end();
  });
}

async function ensureSchema(): Promise<void> {
  await withPostgresClient(async (client) => {
    const { rows } = await client.query("SELECT to_regclass('cp_items') AS reg");
    if (rows[0].reg) return;
    const sqlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sql", "migrations", "0001_init.sql");
    const sql = await readFile(sqlPath, "utf8");
    await client.query(sql);
  });
}

async function seedRepoWithTargetFolder(repoGuid: string): Promise<{ targetAddress: string }> {
  const now = new Date();
  await withPostgresClient(async (client) => {
    const rootId = randomUUID();
    const rootConfig = { id: rootId, address: repoGuid, type: "Folder", name: `chad_test_story109`, created: now.toISOString(), modified: now.toISOString() };
    await client.query(
      `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [rootId, repoGuid, repoGuid, rootConfig.name, "Folder", JSON.stringify(rootConfig), "", now]
    );
    const targetId = randomUUID();
    const targetAddress = `${repoGuid}/01`;
    const targetConfig = { id: targetId, address: targetAddress, type: "Folder", name: "Target", created: now.toISOString(), modified: now.toISOString() };
    await client.query(
      `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
      [targetId, repoGuid, targetAddress, targetConfig.name, "Folder", JSON.stringify(targetConfig), "", now]
    );
  });
  return { targetAddress: `${repoGuid}/01` };
}

async function countChildren(parentAddress: string): Promise<number> {
  return withPostgresClient(async (client) => {
    const escaped = parentAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM cp_items WHERE address ~ $1`, [`^${escaped}/[0-9]{2,3}$`]);
    return rows[0].n as number;
  });
}

beforeAll(async () => {
  await ensureSchema();
  contactPhotosRoot = await mkdtemp(path.join(tmpdir(), "cp-import-test-photos-root-"));
  process.env.CHAD_CONTACT_PHOTOS_DIR = contactPhotosRoot;
});

afterAll(async () => {
  await closePostgresConnection();
  await rm(contactPhotosRoot, { recursive: true, force: true }).catch(() => {});
});

describe("importCpFolderFromZip — end to end against real Postgres", () => {
  it("happy path: imports a Folder+Text tree, returns the created address/count, and rows exist with the right content", async () => {
    const repoGuid = randomUUID();
    const username = "story109-test";
    const { targetAddress } = await seedRepoWithTargetFolder(repoGuid);

    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Imported\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Text\nname: Note\naddress: y" },
      { path: "01/02/body.txt", content: "hello from the import" },
    ]);

    const output = await runWithRepoContext({ repoGuid, username }, () =>
      importCpFolderFromZip({ parentAddress: targetAddress, targetRepoGuid: repoGuid, zipBytes: zip })
    );

    expect(output.createdItemCount).toBe(2);
    expect(output.createdRootAddress).toBe(`${targetAddress}/01`);

    const rows = await withPostgresClient(async (client) => {
      const { rows } = await client.query("SELECT address, name, type, body FROM cp_items WHERE address IN ($1,$2)", [
        output.createdRootAddress,
        `${output.createdRootAddress}/01`,
      ]);
      return rows;
    });
    expect(rows).toHaveLength(2);
    const root = rows.find((r) => r.address === output.createdRootAddress);
    const child = rows.find((r) => r.address !== output.createdRootAddress);
    expect(root).toMatchObject({ name: "Imported", type: "Folder" });
    expect(child).toMatchObject({ name: "Note", type: "Text", body: "hello from the import" });
  });

  it("atomicity: an invalid item anywhere in the tree fails validation and adds NOTHING", async () => {
    const repoGuid = randomUUID();
    const username = "story109-test";
    const { targetAddress } = await seedRepoWithTargetFolder(repoGuid);
    const before = await countChildren(targetAddress);

    const zip = await buildZip([
      { path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Imported\naddress: x" },
      { path: "01/02/config.yaml", content: "id: b\ntype: Folder\nname: GoodChild\naddress: y" },
      { path: "01/03/config.yaml", content: "id: c\ntype: BrokenType\nname: BadChild\naddress: z" },
    ]);

    await expect(
      runWithRepoContext({ repoGuid, username }, () =>
        importCpFolderFromZip({ parentAddress: targetAddress, targetRepoGuid: repoGuid, zipBytes: zip })
      )
    ).rejects.toThrow(CpImportError);

    const after = await countChildren(targetAddress);
    expect(after).toBe(before);
  });

  it("commit-phase conflict: an existing same-named sibling causes ROLLBACK, nothing added", async () => {
    const repoGuid = randomUUID();
    const username = "story109-test";
    const { targetAddress } = await seedRepoWithTargetFolder(repoGuid);

    await withPostgresClient(async (client) => {
      const now = new Date();
      const id = randomUUID();
      const address = `${targetAddress}/01`;
      const config = { id, address, type: "Folder", name: "Imported", created: now.toISOString(), modified: now.toISOString() };
      await client.query(
        `INSERT INTO cp_items (id, repo_guid, address, name, type, config, body, created_at, modified_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$8)`,
        [id, repoGuid, address, "Imported", "Folder", JSON.stringify(config), "", now]
      );
    });
    const before = await countChildren(targetAddress);
    expect(before).toBe(1);

    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Imported\naddress: x" }]);

    let caught: unknown;
    try {
      await runWithRepoContext({ repoGuid, username }, () =>
        importCpFolderFromZip({ parentAddress: targetAddress, targetRepoGuid: repoGuid, zipBytes: zip })
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CpImportError);
    expect((caught as CpImportError).code).toBe("ROOT_NAME_CONFLICT");

    const after = await countChildren(targetAddress);
    expect(after).toBe(1); // still just the pre-existing one — nothing added
  });

  it("cleanup: the per-import staging directory never lingers after PASS or FAIL", async () => {
    const repoGuid = randomUUID();
    const username = "story109-cleanup-test";
    const { targetAddress } = await seedRepoWithTargetFolder(repoGuid);

    const goodZip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Good\naddress: x" }]);
    await runWithRepoContext({ repoGuid, username }, () =>
      importCpFolderFromZip({ parentAddress: targetAddress, targetRepoGuid: repoGuid, zipBytes: goodZip })
    );

    const badZip = await buildZip([]);
    await runWithRepoContext({ repoGuid, username }, () =>
      importCpFolderFromZip({ parentAddress: targetAddress, targetRepoGuid: repoGuid, zipBytes: badZip })
    ).catch(() => {});

    const tempDir = path.join(contactPhotosRoot, username, "02_files_zip", "temp");
    let leftover: string[] = [];
    try {
      leftover = await readdir(tempDir);
    } catch {
      leftover = []; // temp/ itself not existing at all is also a valid "nothing left" outcome
    }
    expect(leftover).toEqual([]);
  });

  it("defense-in-depth: rejects a parentAddress that doesn't actually belong to the declared targetRepoGuid", async () => {
    // targetRepoGuid is the caller's own authorized claim (mirrors what the
    // route computes from resolveFoldersRepoAccess) — this proves the
    // import still refuses to write when parentAddress and targetRepoGuid
    // disagree, regardless of what the session's own repo is. This guards
    // against a caller-side bug upstream (e.g. the route) ever letting the
    // two drift apart, independent of resolveFoldersRepoAccess itself.
    const repoGuidA = randomUUID();
    const repoGuidB = randomUUID();
    const { targetAddress: targetInB } = await seedRepoWithTargetFolder(repoGuidB);

    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Sneaky\naddress: x" }]);

    let caught: unknown;
    try {
      await runWithRepoContext({ repoGuid: repoGuidA, username: "attacker" }, () =>
        importCpFolderFromZip({ parentAddress: targetInB, targetRepoGuid: repoGuidA, zipBytes: zip })
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CpImportError);
    expect((caught as CpImportError).code).toBe("PARENT_NOT_FOUND");

    const after = await countChildren(targetInB);
    expect(after).toBe(0);
  });

  it("authorized cross-repo import succeeds even when the target repo differs from the session's OWN repo (e.g. chad_shared)", async () => {
    // Regression test for the real bug this fixed: importCpFolderFromZip
    // used to re-derive the target repo from the session's own repoGuid
    // (getCurrentRepoGuid()) instead of trusting the caller-declared,
    // already-authorized targetRepoGuid — so ANY import into a repo other
    // than the actor's own (chad_shared, now open to every user) failed
    // with PARENT_NOT_FOUND even though it was fully authorized upstream.
    const ownRepoGuid = randomUUID();
    const sharedRepoGuid = randomUUID();
    const { targetAddress: targetInShared } = await seedRepoWithTargetFolder(sharedRepoGuid);

    const zip = await buildZip([{ path: "01/config.yaml", content: "id: a\ntype: Folder\nname: Shared\naddress: x" }]);

    const output = await runWithRepoContext({ repoGuid: ownRepoGuid, username: "any-user" }, () =>
      importCpFolderFromZip({ parentAddress: targetInShared, targetRepoGuid: sharedRepoGuid, zipBytes: zip })
    );

    expect(output.createdItemCount).toBe(1);
    const after = await countChildren(targetInShared);
    expect(after).toBe(1);
  });
});
