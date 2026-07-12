#!/usr/bin/env node
/**
 * Read-only compatibility smoke test: cp-files vs the real, running .NET
 * Content Provider API (localhost:12024, "chad-content-provider-api-local-mac-docker",
 * confirmed via `docker inspect` to be bind-mounted from the same real
 * /Users/pawelfluder/Dropbox this script reads directly).
 *
 * NEVER calls Put/PostParentItem. Only GetItem/GetByNames/GetManyByName —
 * strictly read-only, per the migration plan's Stage 2/Etap D requirement.
 *
 * Run: node packages/content-provider/files/tests/compat-smoke.mjs
 */

process.env.CP_FILES_STORAGE_ROOT ??= "/Users/pawelfluder/Dropbox";
process.env.CONTENT_PROVIDER_API_URL ??= "http://localhost:12024";

const { filesStorage } = await import("../dist/index.js");
const { netAdapterStorage } = await import("../../net-adapter/dist/index.js");

const REPO = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641"; // SHARED_REPO_ID, per documentation/dba/resolve-paths.md

let failures = 0;
let passes = 0;

function compareItems(label, a, b) {
  const aConfig = JSON.stringify(a.Config, Object.keys(a.Config).sort());
  const bConfig = JSON.stringify(b.Config, Object.keys(b.Config).sort());
  const mismatches = [];
  if (a.Address !== b.Address) mismatches.push(`Address: files="${a.Address}" net="${b.Address}"`);
  if (a.Body !== b.Body) mismatches.push(`Body: files=${JSON.stringify(a.Body).slice(0, 200)} net=${JSON.stringify(b.Body).slice(0, 200)}`);
  if (aConfig !== bConfig) mismatches.push(`Config: files=${aConfig} net=${bConfig}`);

  if (mismatches.length === 0) {
    console.log(`PASS  ${label}`);
    passes++;
  } else {
    console.log(`FAIL  ${label}`);
    for (const m of mismatches) console.log(`        ${m}`);
    failures++;
  }
}

async function testGetItem(loca) {
  const label = `GetItem(${REPO}, "${loca}")`;
  try {
    const [filesResult, netResult] = await Promise.all([
      filesStorage.GetItem(REPO, loca),
      netAdapterStorage.GetItem(REPO, loca),
    ]);
    compareItems(label, filesResult, netResult);
  } catch (err) {
    console.log(`ERROR ${label}: ${err.message}`);
    failures++;
  }
}

async function testGetByNames(names) {
  const label = `GetByNames(${REPO}, ${names.map((n) => `"${n}"`).join(", ")})`;
  try {
    const [filesResult, netResult] = await Promise.all([
      filesStorage.GetByNames(REPO, ...names),
      netAdapterStorage.GetByNames(REPO, ...names),
    ]);
    compareItems(label, filesResult, netResult);
  } catch (err) {
    console.log(`ERROR ${label}: ${err.message}`);
    failures++;
  }
}

async function testGetManyByName(parentLoca, name) {
  const label = `GetManyByName(${REPO}, "${parentLoca}", "${name}")`;
  try {
    const [filesResult, netResult] = await Promise.all([
      filesStorage.GetManyByName(REPO, parentLoca, name),
      netAdapterStorage.GetManyByName(REPO, parentLoca, name),
    ]);
    if (filesResult.length !== netResult.length) {
      console.log(`FAIL  ${label}: count mismatch files=${filesResult.length} net=${netResult.length}`);
      failures++;
      return;
    }
    const filesAddresses = filesResult.map((r) => r.Address).sort();
    const netAddresses = netResult.map((r) => r.Address).sort();
    const addressMismatch = filesAddresses.some((a, i) => a !== netAddresses[i]);
    if (addressMismatch) {
      console.log(`FAIL  ${label}: address sets differ`);
      console.log(`        files: ${JSON.stringify(filesAddresses)}`);
      console.log(`        net:   ${JSON.stringify(netAddresses)}`);
      failures++;
      return;
    }
    console.log(`PASS  ${label} (${filesResult.length} items, addresses match)`);
    passes++;
  } catch (err) {
    console.log(`ERROR ${label}: ${err.message}`);
    failures++;
  }
}

async function testFindRecursively(loca, phrase) {
  const label = `FindRecursively(${REPO}, "${loca}", "${phrase}")`;
  try {
    const [filesResult, netResult] = await Promise.all([
      filesStorage.FindRecursively(REPO, loca, phrase),
      netAdapterStorage.FindRecursively(REPO, loca, phrase),
    ]);
    const filesAddresses = filesResult.map((r) => r.Address).sort();
    const netAddresses = netResult.map((r) => r.Address).sort();
    const same = filesAddresses.length === netAddresses.length && filesAddresses.every((a, i) => a === netAddresses[i]);
    if (!same) {
      console.log(`FAIL  ${label}`);
      console.log(`        files: ${JSON.stringify(filesAddresses)}`);
      console.log(`        net:   ${JSON.stringify(netAddresses)}`);
      failures++;
      return;
    }
    console.log(`PASS  ${label} (${filesResult.length} matches, addresses match)`);
    passes++;
  } catch (err) {
    console.log(`ERROR ${label}: ${err.message}`);
    failures++;
  }
}

/** Both cp-files and the real .NET API are expected to THROW on this — a real Ref item with a stale, unresolvable refAddress (confirmed 2026-07-12, no real Ref item in local data has a resolvable target). */
async function testRefErrorParity(loca) {
  const label = `GetItem(${REPO}, "${loca}") [Ref, expected to throw both sides]`;
  const filesThrew = await filesStorage.GetItem(REPO, loca).then(() => false).catch(() => true);
  const netThrew = await netAdapterStorage.GetItem(REPO, loca).then(() => false).catch(() => true);
  if (filesThrew && netThrew) {
    console.log(`PASS  ${label}`);
    passes++;
  } else {
    console.log(`FAIL  ${label}: filesThrew=${filesThrew} netThrew=${netThrew}`);
    failures++;
  }
}

console.log(`Storage root: ${process.env.CP_FILES_STORAGE_ROOT}`);
console.log(`Real API: ${process.env.CONTENT_PROVIDER_API_URL}`);
console.log(`Repo: ${REPO}\n`);

await testGetItem(""); // repo root
await testGetItem("03"); // "leads" folder
await testGetItem("03/06"); // "all items" folder
await testGetItem("03/06/71"); // a lead (Folder)
await testGetItem("03/06/71/01"); // "contacts" (Text)
await testGetItem("03/06/71/03"); // "status" (Text)
await testGetItem("00"); // "hidden" (2-digit non-01 folder, sanity check on numeric parsing)
await testGetByNames(["leads", "all items"]);
await testGetByNames(["beeper"]);
await testGetManyByName("03/06/71", "contacts"); // grandchildren of a lead: expect 0 (leaf items have no children)
await testGetManyByName("03/06", "contacts"); // grandchildren of "all items": expect N real matches
await testGetManyByName("03/06", "status"); // grandchildren of "all items": expect N real matches
await testFindRecursively("03/06", "//todo"); // real data: 4 matches
await testRefErrorParity("03/17/11/05"); // real Ref item, stale refAddress "Active/05/18" — both sides must throw

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures > 0 ? 1 : 0);
