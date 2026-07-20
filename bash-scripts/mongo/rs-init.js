// Idempotent MongoDB replica-set initializer.
//
// Safe to run any number of times: if rs0 is already initialized, this is a
// no-op. Only actually calls rs.initiate() the first time it ever runs
// against a fresh /data/db.
//
// IMPORTANT: "chad-mongodb" as the member host below is the container_name,
// not the Docker Compose service name ("mongodb") — resolvable by any
// container on the external "chad-shared" network, including
// chad-dashboard-test/chad-dashboard-prod, which live in SEPARATE compose
// projects and only ever reach Mongo by container_name (see
// shared-qnap-services.md, "DNS between separate Compose projects"). Story
// 74 (2026-07-20) changed this from the original "mongodb" literal, which
// predated the shared/test/prod split (2026-07-11) and assumed one single
// compose project for everything. Still NOT resolvable from the Mac
// (beeper-ws/beeper-sync, connecting over Tailscale) — every external
// client must connect with `directConnection=true` in its MONGODB_URI,
// which tells the driver to talk only to the one node given and skip full
// replica-set topology discovery (which would otherwise try, and fail, to
// resolve "chad-mongodb"). See
// ai-docs/deploy/2026-07-10_mongodb-replica-set-migration-plan.md.

// NOTE (Story 74, found during the real QNAP run): the LEGACY `mongo`
// shell's rs.status() does NOT throw on an {ok:0} response the way
// `mongosh`/modern drivers do — it just returns the error document as a
// normal value (db._adminCommand isn't assert-wrapped here). An earlier
// version of this script assumed exception-based control flow (correct for
// mongosh, wrong for the legacy shell mongo:4.4 actually ships) and so
// silently treated the pre-initiation `NotYetInitialized` response as
// "already initialized" (status.set was just `undefined`), skipping
// rs.initiate() entirely without error. Fixed to check `status.ok` and
// `status.codeName` explicitly on the returned value first, and only fall
// back to try/catch for genuinely unexpected exceptions.
function checkStatus() {
  try {
    return { threw: false, value: rs.status() };
  } catch (e) {
    return { threw: true, value: e };
  }
}

const { threw, value } = checkStatus();

const notYetInitialized = threw
  ? value.codeName === "NotYetInitialized" || /no replset config|NotYetInitialized/i.test(value.message || "")
  : value.ok !== 1 && (value.codeName === "NotYetInitialized" || /no replset config/i.test(value.errmsg || ""));

if (!notYetInitialized && !threw && value.ok === 1) {
  print(`Replica set already initialized (set: ${value.set}), skipping.`);
} else if (!notYetInitialized) {
  const message = threw ? value.message : JSON.stringify(value);
  print(`Unexpected error checking replica set status: ${message}`);
  throw new Error(message);
} else {
  print("Replica set not yet initialized. Running rs.initiate()...");
  const result = rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "chad-mongodb:27017" }],
  });
  printjson(result);

  if (result.ok !== 1) {
    throw new Error(`rs.initiate() failed: ${JSON.stringify(result)}`);
  }

  print("Replica set rs0 initialized successfully.");
}
