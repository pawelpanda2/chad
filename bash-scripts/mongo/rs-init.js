// Idempotent MongoDB replica-set initializer.
//
// Safe to run any number of times: if rs0 is already initialized, this is a
// no-op. Only actually calls rs.initiate() the first time it ever runs
// against a fresh /data/db.
//
// IMPORTANT: "mongodb" as the member host below is the Docker Compose
// service name — resolvable by other containers on the same compose network
// (dashboard, beeper-oplog), but NOT resolvable from the Mac (beeper-ws /
// beeper-sync, connecting over Tailscale). That is expected and handled on
// the client side: every external client must connect with
// `directConnection=true` in its MONGODB_URI, which tells the driver to
// talk only to the one node given and skip full replica-set topology
// discovery (which would otherwise try, and fail, to resolve "mongodb").
// See documentation/ai-docs/2026-07-10_mongodb-replica-set-migration-plan.md.

try {
  const status = rs.status();
  print(`Replica set already initialized (set: ${status.set}), skipping.`);
} catch (e) {
  const notYetInitialized =
    e.codeName === "NotYetInitialized" ||
    /no replset config|NotYetInitialized/i.test(e.message || "");

  if (!notYetInitialized) {
    print(`Unexpected error checking replica set status: ${e.message}`);
    throw e;
  }

  print("Replica set not yet initialized. Running rs.initiate()...");
  const result = rs.initiate({
    _id: "rs0",
    members: [{ _id: 0, host: "mongodb:27017" }],
  });
  printjson(result);

  if (result.ok !== 1) {
    throw new Error(`rs.initiate() failed: ${JSON.stringify(result)}`);
  }

  print("Replica set rs0 initialized successfully.");
}
