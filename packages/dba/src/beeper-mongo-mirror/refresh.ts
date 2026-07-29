import { MongoClient, type Db } from "mongodb";
import { readBeeperMirrorMetadata, writeBeeperMirrorMetadata, type BeeperMirrorMetadata } from "./metadata.js";

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RefreshBeeperMirrorOptions {
  repoGuid: string;
  /** Server Beeper Mongo on QNAP — the SAME target the writers (beeper-ws/beeper-sync) use. Read-only from this module's point of view. */
  sourceUri: string;
  /** Local mirror Mongo — a completely separate env var from the Dashboard's own BEEPER_MONGODB_URI (see plugins/beeper-synch's config.ts). */
  targetUri: string;
}

function assertValidRepoGuid(repoGuid: string): void {
  if (typeof repoGuid !== "string" || !GUID_RE.test(repoGuid)) {
    throw new Error(`refreshBeeperMongoMirror: invalid repoGuid ${JSON.stringify(repoGuid)}`);
  }
}

/** host:port only — never credentials. */
function hostPortOf(uri: string): string {
  try {
    return new URL(uri.replace(/^mongodb(\+srv)?:\/\//, "http://")).host;
  } catch {
    return "(unresolved)";
  }
}

/** Mirrors beeper-crm.ts's ensureBeeperIndexes() — kept as its own small copy, same reasoning as owner-db.mjs's three independent copies (see ai-docs/beeper/ai-start.md): this is mirror-maintenance code, never routed through assertBeeperWriteAllowed() (that guard is for the Dashboard's own business mutations, not this technical writer). Run on the STAGING collections before they are promoted — a duplicate-key violation here means the source data itself is inconsistent, which must fail the whole refresh rather than silently promoting bad data. */
async function ensureMirrorIndexes(db: Db): Promise<void> {
  const contacts = db.collection("contacts");
  const channels = db.collection("channels");
  const messages = db.collection("messages");
  const timelineEvents = db.collection("timeline_events");

  await Promise.all([
    contacts.createIndex(
      { "identities.senderID": 1 },
      {
        unique: true,
        partialFilterExpression: { "identities.senderID": { $type: "string" } },
        name: "identities_senderID_unique",
      }
    ),
    contacts.createIndex({ tags: 1 }),
    channels.createIndex({ beeperChatID: 1 }, { unique: true, sparse: true }),
    channels.createIndex({ participantIDs: 1 }),
    channels.createIndex({ lastMessageAt: -1 }),
    messages.createIndex(
      { beeperMessageID: 1, network: 1 },
      { unique: true, partialFilterExpression: { beeperMessageID: { $type: "string" } } }
    ),
    messages.createIndex({ channelID: 1, timestamp: -1 }),
    messages.createIndex({ contactID: 1, timestamp: -1 }),
    messages.createIndex({ channelID: 1, timestamp: 1, isSelf: 1 }),
    timelineEvents.createIndex({ contactID: 1, timestamp: 1 }),
  ]);
}

/**
 * One-way mirror refresh: QNAP beeper-mongodb -> local Mongo, for one
 * user's beeper_<repoGuid> database (Story 92).
 *
 * Safety model: never touches the live local mirror database until a full
 * copy has been staged in a separate `<db>__mirror_staging` database on the
 * SAME local mongod AND its counts verified to match the source AND its
 * indexes built successfully. Only then does each collection get an atomic
 * `renameCollection` (dropTarget: true) from staging into the live mirror.
 * A crash/error at any point before the rename step leaves the last-good
 * live mirror completely untouched — the only side effect is a discarded
 * staging database, which the next run's `dropDatabase()` cleans up
 * idempotently. A source (QNAP) connectivity failure never touches the
 * local mirror at all and always preserves the previous `lastSuccessAt`.
 *
 * Includes a cheap per-collection `countDocuments` pre-check: if every
 * collection's count is unchanged since the last successful run, the
 * (comparatively) expensive staging copy is skipped this cycle (result
 * "NO_CHANGE"). Known limitation: a same-document-count content edit
 * (e.g. a tag change with no insert/delete) is only caught once some
 * collection's count also changes — documented, accepted tradeoff for a
 * best-effort emergency mirror (see backlog/stories/92).
 */
export async function refreshBeeperMongoMirror(opts: RefreshBeeperMirrorOptions): Promise<BeeperMirrorMetadata> {
  assertValidRepoGuid(opts.repoGuid);

  const checkedAt = new Date().toISOString();
  const sourceHostPort = hostPortOf(opts.sourceUri);
  const targetHostPort = hostPortOf(opts.targetUri);

  if (sourceHostPort !== "(unresolved)" && sourceHostPort === targetHostPort) {
    throw new Error(
      `refreshBeeperMongoMirror: refusing to run — source and target resolve to the same host (${sourceHostPort})`
    );
  }

  const previous = readBeeperMirrorMetadata(opts.repoGuid);
  const liveDbName = `beeper_${opts.repoGuid}`;

  const fail = (message: string): BeeperMirrorMetadata => {
    const meta: BeeperMirrorMetadata = {
      repoGuid: opts.repoGuid,
      sourceHostPort,
      targetHostPort,
      lastCheckedAt: checkedAt,
      lastSuccessAt: previous?.lastSuccessAt,
      result: "FAIL",
      collections: previous?.collections ?? {},
      lastError: message,
    };
    writeBeeperMirrorMetadata(meta);
    return meta;
  };

  let sourceClient: MongoClient | undefined;
  let targetClient: MongoClient | undefined;

  try {
    try {
      sourceClient = new MongoClient(opts.sourceUri, { serverSelectionTimeoutMS: 5_000 });
      await sourceClient.connect();
    } catch (err) {
      return fail(`source unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }

    const sourceDb = sourceClient.db(liveDbName);
    let collections: { name: string }[];
    const sourceCounts: Record<string, number> = {};
    try {
      collections = await sourceDb.listCollections().toArray();
      for (const c of collections) {
        sourceCounts[c.name] = await sourceDb.collection(c.name).countDocuments({});
      }
    } catch (err) {
      return fail(`source read failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const previousCollectionNames = previous?.collections ? Object.keys(previous.collections) : [];
    const unchanged =
      previous != null &&
      previous.result !== "FAIL" &&
      previousCollectionNames.length === Object.keys(sourceCounts).length &&
      Object.entries(sourceCounts).every(([name, count]) => previous.collections[name] === count);

    if (unchanged) {
      const meta: BeeperMirrorMetadata = {
        repoGuid: opts.repoGuid,
        sourceHostPort,
        targetHostPort,
        lastCheckedAt: checkedAt,
        lastSuccessAt: previous!.lastSuccessAt ?? checkedAt,
        result: "NO_CHANGE",
        collections: sourceCounts,
      };
      writeBeeperMirrorMetadata(meta);
      return meta;
    }

    targetClient = new MongoClient(opts.targetUri, { serverSelectionTimeoutMS: 5_000 });
    await targetClient.connect();

    const stagingDbName = `${liveDbName}__mirror_staging`;
    const stagingDb = targetClient.db(stagingDbName);
    await stagingDb.dropDatabase();

    for (const c of collections) {
      const srcCol = sourceDb.collection(c.name);
      const dstCol = stagingDb.collection(c.name);
      const BATCH = 500;
      let batch: Record<string, unknown>[] = [];
      for await (const doc of srcCol.find({})) {
        batch.push(doc);
        if (batch.length >= BATCH) {
          await dstCol.insertMany(batch, { ordered: false });
          batch = [];
        }
      }
      if (batch.length) await dstCol.insertMany(batch, { ordered: false });
    }

    const stagedCounts: Record<string, number> = {};
    for (const c of collections) {
      stagedCounts[c.name] = await stagingDb.collection(c.name).countDocuments({});
    }
    for (const [name, count] of Object.entries(sourceCounts)) {
      if (stagedCounts[name] !== count) {
        throw new Error(`staging verification failed for "${name}": source=${count} staged=${stagedCounts[name]}`);
      }
    }

    await ensureMirrorIndexes(stagingDb);

    const admin = targetClient.db("admin").admin();
    for (const c of collections) {
      await admin.command({
        renameCollection: `${stagingDbName}.${c.name}`,
        to: `${liveDbName}.${c.name}`,
        dropTarget: true,
      });
    }
    await stagingDb.dropDatabase().catch(() => {});

    const meta: BeeperMirrorMetadata = {
      repoGuid: opts.repoGuid,
      sourceHostPort,
      targetHostPort,
      lastCheckedAt: checkedAt,
      lastSuccessAt: checkedAt,
      result: "PASS",
      collections: sourceCounts,
    };
    writeBeeperMirrorMetadata(meta);
    return meta;
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  } finally {
    await sourceClient?.close().catch(() => {});
    await targetClient?.close().catch(() => {});
  }
}
