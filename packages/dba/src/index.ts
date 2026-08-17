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
export * from './report-browse.js';
export * from './date-reports.js';
export * from './google-contacts-tokens.js';
export * from './payments.js';
export * from './license-commerce.js';
export * from './beeper.js';
export * from './mongo.js';
export * from './postgres.js';
export * from './dev-db-override.js';
export * from './chad-data-mode.js';
export * from './dev-data-source.js';
export * from './offline-readonly-backup/constants.js';
export * from './offline-readonly-backup/metadata.js';
export * from './offline-readonly-backup/verify-readonly.js';
export * from './sync-local-from-qnap.js';
export * from './beeper-mongo-mirror/metadata.js';
export * from './beeper-mongo-mirror/refresh.js';
export * from './secrets-crypto.js';
export * from './beeper-crm.js';
export * from './beeper-groups.js';
export * from './beeper-platform.js';
export * from './path-resolver.js';
export * from './ai-answer.js';
export * from './ai-prompts.js';
export * from './ai-prompts-openai.js';
export * from './audio-recordings.js';
export * from './audio-recording-drafts.js';
export * from './google-contact-photos.js';
export * from './lead-photos.js';
export * from './lead-archives.js';
export {
  FILE_STORAGE_FEATURES,
  FILES_REFERENCED_HOST_PARENT,
  createFilesystemFileStorage,
  createMemoryReferencedFileStore,
  filesystemFileStorage,
  postgresReferencedFileStore,
  sanitizeStorageSegment,
  buildReadableFileName,
  buildRelativeStoragePath,
  resolveEntityStorage,
  resolveFeatureStorage,
  resolveUserStorageRoot,
  FileStorageError,
  FileStoragePathError,
  isCp1StorageFailure,
  requestLocalCp1Repair,
  maybeRequestCp1Repair,
} from './file-storage/index.js';
export type {
  FileStorageFeature,
  FileStorageEntityType,
  ReferencedFileMetadata,
  FileStorageProvider,
  PutFileInput,
  ListFilesQuery,
  FileReadInfo,
} from './file-storage/index.js';
export * from './message-creator.js';
export * from './lead-beeper-links.js';
export * from './lead-analysis-prompt.js';
export * from './lead-analysis-context.js';
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
export * from './cp-import.js';
export * from './knowledge.js';
export * from './shared-repo-access.js';
export * from './cp-link-resolver.js';
export * from './admin-users.js';
export * from './cp-history.js';
export * from './history-pages.js';
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
export * from './google-sheets/reconciliation.js';
export * from './google-sheets/worker.js';
export * from './google-sheets/sync.js';
export * from './google-sheets/layout.js';
export * from './google-sheets/bootstrap.js';
export * from './google-sheets/production-guard.js';
export * from './system-folders.js';
export * from './msg-workout-matching.js';
export * from './msg-workout-linking.js';
export * from './msg-workout-proposals.js';
export * from './msg-workout-analyze.js';
export * from './msg-workout-gui-data.js';
export * from './msg-workout-entry.js';
export {
  runWithGoogleSheetsTxnBuffer,
  deferGoogleSheetsJob,
  deferGoogleSheetsJobFactory,
  flushPendingGoogleSheetsJobs,
} from './google-sheets/txn-hook.js';
// Named (not `export *`) — links-v2/phone-utils.ts's `normalizePhoneDigits`
// intentionally shares a name with lead-beeper-links.ts's own (unrelated,
// old-Links-module) helper of the same name; Links V2 keeps its own copy
// deliberately independent (see links-v2/types.ts's doc comment) rather
// than reusing the old one, so only the public surface dashboard/API
// routes actually need is re-exported here to avoid the barrel collision.
export type { LeadLinksData, BeeperLinkEntry, GoogleContactsLinkEntry } from './links-v2/types.js';
export { readLeadLinks, writeLeadLinks, parseLeadLinksYaml } from './links-v2/links-item.js';
export { syncLinksV2ForCurrentRepo, type LinksV2SyncReport } from './links-v2/sync.js';
export { startLinksV2DailySchedulerIfEnabled, isDailySyncDue } from './links-v2/scheduler.js';
export { getLinksV2PageLeads, getLeadLinksV2ByLoca, type LinksV2LeadSummary } from './links-v2/page-data.js';
export {
  linkBeeperConversationToLead,
  unlinkBeeperConversationFromLead,
  linkGoogleContactToLead,
  unlinkGoogleContactFromLead,
} from './links-v2/manual-links.js';
