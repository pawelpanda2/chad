#!/usr/bin/env node
// Idempotent create-or-update of the root `secrets` Text Item for every
// eligible user, holding the shared Google Sheets viewer account
// (2026-07-28, section 7 of the READY FOR BOSS audit — see
// tests/release-audit-report.md). Never echoes the plaintext password, the
// ciphertext, or any part of either — reports only PASS/FAIL facts.
//
// Eligible users = role:"admin" in the real users-list, plus test2/test3
// (current policy) — read from the real chad_admin/users/users-list, never
// guessed/invented.
//
// Usage:
//   GOOGLE_VIEWER_USERNAME=<email> GOOGLE_VIEWER_PASSWORD=<password> \
//     node packages/dba/scripts/provision-google-viewer-secrets.mjs [--dry-run|--apply]
//
// If GOOGLE_VIEWER_USERNAME/PASSWORD aren't set, this reports BLOCKED and
// exits non-zero — it never invents credentials.

function parseArgs(argv) {
  const args = { apply: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--apply") args.apply = true;
    if (raw === "--dry-run") args.apply = false;
  }
  return args;
}

async function loadDba() {
  return import(new URL("../dist/index.js", import.meta.url).href);
}

async function main() {
  const args = parseArgs(process.argv);
  const viewerUsername = process.env.GOOGLE_VIEWER_USERNAME;
  const viewerPassword = process.env.GOOGLE_VIEWER_PASSWORD;

  if (!viewerUsername || !viewerPassword) {
    console.error(
      "[provision-google-viewer-secrets] BLOCKED — GOOGLE_VIEWER_USERNAME/GOOGLE_VIEWER_PASSWORD not set. " +
        "This script never invents credentials; provide them as env vars from a secure source (never hardcoded/committed) to proceed."
    );
    process.exitCode = 1;
    return;
  }

  const dba = await loadDba();
  const yaml = (await import("js-yaml")).default;

  const usersListBody = await dba.getUsersListBody();
  const usersDoc = yaml.load(usersListBody || "");
  const allUsers = usersDoc?.users || [];

  // Eligible = role:"admin", plus test2/test3 by current explicit policy —
  // never a guessed list.
  const eligible = allUsers.filter((u) => u.role === "admin" || u.username === "test2" || u.username === "test3");

  console.log(`[provision-google-viewer-secrets] mode=${args.apply ? "APPLY" : "DRY-RUN"}, eligible users: ${eligible.map((u) => u.username).join(", ") || "(none found)"}`);

  const encryptedPassword = dba.encryptSecret(viewerPassword);
  // Fail loudly before touching anything if encryption/decryption round-trip
  // doesn't hold (e.g. SECRETS_ENCRYPTION_KEY misconfigured) — never write a
  // secret we can't prove is recoverable.
  if (dba.decryptSecret(encryptedPassword) !== viewerPassword) {
    console.error("[provision-google-viewer-secrets] BLOCKED — encrypt/decrypt round-trip failed. Check SECRETS_ENCRYPTION_KEY.");
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const user of eligible) {
    const { repoGuid, username } = user;
    const result = { user: username, repoGuid, eligible: true, secretsItemExists: false, usernameConfigured: false, encryptedPasswordValid: false, result: "FAIL" };

    try {
      const existing = await dba.runWithRepoContext({ repoGuid, username }, () => dba.resolveByNames(["secrets"]));
      const previousBody = typeof existing?.body === "string" ? existing.body : "";

      if (args.apply) {
        const newBody = `user: ${viewerUsername}\npass: ${encryptedPassword}\n`;
        await dba.runWithRepoContext({ repoGuid, username }, async () => {
          const { item } = await dba.createFolderChildItem(repoGuid, "secrets", "Text", newBody);
          if (item.body !== newBody) {
            await dba.updateFolderTextBody(item.config.address, newBody);
          }
        });
        // Never log previousBody's content (may contain a real ciphertext) —
        // only that a prior value existed, as a same-process backup note.
        if (previousBody) console.log(`[provision-google-viewer-secrets] ${username}: replaced existing secrets item body (previous length=${previousBody.length} chars, not logged).`);
      }

      const after = await dba.runWithRepoContext({ repoGuid, username }, () => dba.resolveByNames(["secrets"]));
      const afterBody = typeof after?.body === "string" ? after.body : "";
      result.secretsItemExists = Boolean(after);
      const userMatch = afterBody.match(/^user:\s*(.+)$/m);
      const passMatch = afterBody.match(/^pass:\s*(.+)$/m);
      result.usernameConfigured = Boolean(userMatch?.[1]);
      if (passMatch?.[1]) {
        try {
          dba.decryptSecret(passMatch[1].trim());
          result.encryptedPasswordValid = true;
        } catch {
          result.encryptedPasswordValid = false;
        }
      }
      result.result = result.secretsItemExists && result.usernameConfigured && result.encryptedPasswordValid ? "PASS" : args.apply ? "FAIL" : "PENDING_APPLY";
    } catch (err) {
      console.error(`[provision-google-viewer-secrets] ${username}: ERROR — ${err instanceof Error ? err.message : err}`);
      result.result = "ERROR";
    }

    results.push(result);
  }

  console.log("\n[provision-google-viewer-secrets] REPORT (no secrets included):");
  console.table(results.map(({ user, repoGuid, eligible, secretsItemExists, usernameConfigured, encryptedPasswordValid, result }) => ({
    user, repoGuid, eligible, secretsItemExists, usernameConfigured, encryptedPasswordValid, result,
  })));

  await dba.closePostgresConnection().catch(() => {});
  process.exitCode = results.some((r) => r.result === "FAIL" || r.result === "ERROR") ? 1 : 0;
}

main().catch((error) => {
  console.error("[provision-google-viewer-secrets] FATAL:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
