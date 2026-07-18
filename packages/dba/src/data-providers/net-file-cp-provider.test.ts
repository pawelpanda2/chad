/**
 * NetFileCpProvider tests — run against the REAL, running local
 * Content Provider container (`chad-content-provider-api-local-mac-docker`,
 * `CONTENT_PROVIDER_API_URL=http://localhost:12024`), since this class's
 * whole job is to be a thin, faithful wrapper over the real wire protocol
 * — a mock would not have caught the real bug this test exists to guard
 * against (CP always minting a fresh GUID / dropping custom fields on
 * every `Put`, fixed by the new `PutItemConfig` two-step in `putItem`).
 *
 * Uses a disposable loca under the real `pawel_f` repo
 * (`21d11bdc-f1f4-44d1-b61a-3fa6b039c641`) — the only way to exercise a
 * real, already-scanned repo — and cleans it up via `docker exec` at the
 * end (the files are owned by the container's user, not writable by the
 * host user directly). `/Volumes/Dropbox/kamilgame042` is a QNAP network
 * volume mounted on this Mac (not a local Dropbox desktop app — there is
 * none running against this path), so writes go over the network share;
 * a just-modified file can briefly report "Device or resource busy" on
 * delete (SMB/network-share lock behavior, possibly the QNAP's own
 * background sync to its real Dropbox account — not this Mac). The loca
 * is unique per run (not a fixed constant) so repeated runs don't fight
 * over the same path while a previous run's lock is still clearing.
 * Cleanup failures are logged, not thrown — a leftover locked directory
 * from one run must never fail the *next* run's assertions.
 *
 * Run via: npx tsc && node dist/data-providers/net-file-cp-provider.test.js
 */

import { execSync } from "node:child_process";
import { NetFileCpProvider } from "./net-file-cp-provider.js";
import type { CpItem } from "../cp-model.js";

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
const LOCA = String(100 + (Date.now() % 900)); // "100".."999", varies per run
const ADDRESS = `${REPO}/${LOCA}`;

function cleanup() {
  try {
    execSync(
      `docker exec chad-content-provider-api-local-mac-docker rm -rf /data/repos2/repos/${REPO}/${LOCA}`,
      { stdio: "pipe" }
    );
  } catch (error) {
    console.log(`  (cleanup warning, non-fatal — Dropbox may still be syncing: ${error})`);
  }
}

async function runTests() {
  console.log("Running NetFileCpProvider Tests (real running Content Provider)...\n");
  let passed = 0;
  let failed = 0;

  async function test(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`  [pass] ${name}`);
      passed++;
    } catch (e) {
      console.log(`  [FAIL] ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${message ?? "assertEquals failed"}: expected ${e}, got ${a}`);
  }

  cleanup(); // start from a clean slate in case a previous run failed midway
  const adapter = new NetFileCpProvider();

  await test("putItem writes the exact id/custom fields via the Put+PutItemConfig two-step", async () => {
    const item: CpItem = {
      _id: "deadbeef-0000-4000-8000-000000000099",
      config: {
        id: "deadbeef-0000-4000-8000-000000000099",
        address: ADDRESS,
        type: "Text",
        name: "legacy-adapter-test",
        customField: "keep-me",
      },
      body: "hello from net-file-cp-provider.test.ts",
    };

    const result = await adapter.executeWrite({
      kind: "put-item",
      operationId: "op-legacy-test-1",
      createdAt: new Date().toISOString(),
      item,
    });

    assertEquals(result.alreadyExisted, false);
    assertEquals(result.item._id, item._id);
    assertEquals(result.item.config.customField, "keep-me");
    assertEquals(result.item.body, item.body);
  });

  await test("getItem reads back the exact id/custom fields AND the body together", async () => {
    const read = await adapter.getItem({ address: ADDRESS });
    assertEquals(read?._id, "deadbeef-0000-4000-8000-000000000099");
    assertEquals(read?.config.customField, "keep-me");
    assertEquals(read?.body, "hello from net-file-cp-provider.test.ts");
  });

  await test("a second putItem (update) still preserves the id, doesn't regress to a fresh GUID", async () => {
    const updated: CpItem = {
      _id: "deadbeef-0000-4000-8000-000000000099",
      config: {
        id: "deadbeef-0000-4000-8000-000000000099",
        address: ADDRESS,
        type: "Text",
        name: "legacy-adapter-test",
        customField: "still-here",
      },
      body: "updated body",
    };
    const result = await adapter.executeWrite({
      kind: "put-item",
      operationId: "op-legacy-test-2",
      createdAt: new Date().toISOString(),
      item: updated,
    });

    assertEquals(result.alreadyExisted, true);
    assertEquals(result.item._id, "deadbeef-0000-4000-8000-000000000099"); // NOT a new GUID
    assertEquals(result.item.config.customField, "still-here");
    assertEquals(result.item.body, "updated body");
  });

  await test("putItemConfig alone updates config without touching the existing body", async () => {
    const configOnly = await adapter.putItemConfig({
      _id: "deadbeef-0000-4000-8000-000000000099",
      config: {
        id: "deadbeef-0000-4000-8000-000000000099",
        address: ADDRESS,
        type: "Text",
        name: "legacy-adapter-test-renamed",
        customField: "still-here",
      },
      body: "IGNORED",
    });
    assertEquals(configOnly.config.name, "legacy-adapter-test-renamed");

    const read = await adapter.getItem({ address: ADDRESS });
    assertEquals(read?.body, "updated body"); // unchanged from the previous test
    assertEquals(read?.config.name, "legacy-adapter-test-renamed");
  });

  cleanup();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
