/**
 * chad-dba - Shared Content Provider Database Access Layer
 * 
 * This module provides a unified interface for accessing the Content Provider API
 * used by both chad-console and chad-dashboard projects.
 * 
 * @module chad-dba
 */

export * from './client.js';
export * from './repo-context.js';
export * from './repo-access.js';
export * from './leads.js';
export * from './reports.js';
export * from './report-entries.js';
export * from './beeper.js';
export * from './mongo.js';
export * from './postgres.js';
export * from './dev-db-override.js';
export * from './secrets-crypto.js';
export * from './beeper-crm.js';
export * from './path-resolver.js';
export * from './ai-answer.js';
export * from './statuses-dashboard.js';
export * from './headers-parser.js';
export * from './trace.js';
export * from './trace-collector.js';
export * from './cp-model.js';
export * from './data-clock.js';
export * from './data-commands.js';
export * from './data-providers/types.js';
export * from './data-providers/config.js';
export * from './data-providers/mongo-cp-provider.js';
// Named (not `export *`) — postgres-cp-provider.ts's AddressConflictError/
// DuplicateChildNameError intentionally share names with
// mongo-cp-provider.ts's own (same concept, independent backend
// implementation); a blanket `export *` here would collide with the Mongo
// exports above.
export { PostgresCpProvider } from './data-providers/postgres-cp-provider.js';
export * from './data-providers/net-file-cp-provider.js';
export * from './data-providers/file-cp-provider.js';
export * from './data-providers/cp-fs-reader.js';
export * from './data-outbox.js';
export * from './data-router.js';
export * from './data-router-instance.js';
export * from './data-outbox-worker.js';
export * from './data-outbox-bootstrap.js';
export * from './data-sync-diagnostics.js';
export * from './item-ops.js';
export * from './folders.js';
export * from './admin-users.js';
export * from './cp-history.js';
// Named (not `export *`) — cp-history/mutate.ts's own CpHistoryActor/
// CpHistoryDoc types intentionally differ in shape from cp-history.ts's
// read-side types of the same name (e.g. mutate.ts's is the raw write-side
// shape); a blanket `export *` here would silently make either name
// ambiguous/unresolvable through this barrel. Only the migration
// script/integrity checker (packages/dba/scripts/) need these.
export {
  executeCpMutationWithHistory,
  migrateLegacyCpItem,
  ensureCpHistoryIndexes,
  CP_ITEMS_COLLECTION,
  CP_HISTORY_COLLECTION,
  HISTORY_SNAPSHOT_INTERVAL,
  CpItemNotMigratedError,
  CpItemAlreadyDeletedError,
  CpHistoryVersionConflictError,
} from './cp-history/mutate.js';
export { hashCpState, canonicalCpStateJson } from './cp-history/hash.js';
export * from './google-sheets/types.js';
export * from './google-sheets/config.js';
export * from './google-sheets/mapper.js';
export * from './google-sheets/fake-client.js';
export * from './google-sheets/sheets-api-client.js';
export * from './google-sheets/service-account-auth.js';
export * from './google-sheets/outbox.js';
export * from './google-sheets/worker.js';
export * from './google-sheets/sync.js';
export * from './google-sheets/layout.js';
export * from './google-sheets/bootstrap.js';
export * from './google-sheets/production-guard.js';
