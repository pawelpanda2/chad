/**
 * Content Provider - Main Entry Point
 *
 * This module exports all public APIs for the Content Provider system.
 * It serves as the single entry point for consuming the Content Provider
 * from other parts of the application.
 */

// Import all modules for re-export and internal use
import {
  ensureContentProviderRoot,
  listRepos,
  readRepo,
  readRepoConfig,
  writeRepoConfig,
  createRepo,
  deleteRepo,
  repoExists,
  getRepoSummary,
} from "./repo-service";

import {
  getContentProviderRootPath,
} from "./config";

import {
  listNodes,
  readNodeByAddress,
  readNodeById,
  readNodeConfig,
  writeNodeConfig,
  getNodeFiles,
  readNodeFile,
  createNode,
  deleteNode,
  moveNode,
  nodeExists,
  getNodeSummary,
  writeNodeFile,
  getByNames,
} from "./node-service";

import {
  rebuildIndex,
  readIndex,
  findNodeById,
  findNodeByRepoAndId,
  findNodeByAddress,
  findNodesByType,
  getIndexStats,
  indexExists,
  getIndexPathValue,
  getSqlitePathValue,
} from "./index-service";

import {
  seedExampleData,
  clearAllData,
  needsSeeding,
} from "./seed";

// ============================================================================
// Types
// ============================================================================
export type {
  CpNodeType,
  CpNodeConfig,
  CpNodeFormat,
  CpRepoConfig,
  CpNode,
  CpNodeFile,
  CpRepo,
  CpRoot,
  CpIndexNodeEntry,
  CpGlobalIndex,
  CpListReposResponse,
  CpRepoSummary,
  CpListNodesResponse,
  CpNodeSummary,
  CpGetNodeResponse,
  CpNodeDetail,
  CpNodeFileSummary,
  CpListNodesOptions,
} from "./types";

// ============================================================================
// Configuration
// ============================================================================
export {
  getContentProviderRootPath,
  getDocstorePath,
  getIndexPath,
  getSqlitePath,
  getReposPath,
  getRepoPath,
  getRepoConfigPath,
  getRepoContentPath,
  getNodePath,
  getNodeConfigPath,
  getRootPathEnvVarName,
} from "./config";

// ============================================================================
// Filesystem Utilities
// ============================================================================
export {
  ensureDirectory,
  pathExists,
  isDirectory,
  isFile,
  readFile,
  writeFile,
  listFiles,
  listDirectories,
  listAllSubdirectories,
  parseYaml,
  objectToYaml,
} from "./fs-utils";

// ============================================================================
// Repository Service
// ============================================================================
export {
  ensureContentProviderRoot,
  getContentProviderRoot,
  listRepos,
  readRepo,
  readRepoConfig,
  writeRepoConfig,
  createRepo,
  deleteRepo,
  repoExists,
  getRepoSummary,
} from "./repo-service";

// ============================================================================
// Node Service
// ============================================================================
export {
  listNodes,
  readNodeByAddress,
  readNodeById,
  readNodeConfig,
  writeNodeConfig,
  getNodeFiles,
  readNodeFile,
  createNode,
  deleteNode,
  moveNode,
  nodeExists,
  getNodeSummary,
  writeNodeFile,
  getByNames,
} from "./node-service";

// ============================================================================
// Index Service
// ============================================================================
export {
  rebuildIndex,
  readIndex,
  findNodeById,
  findNodeByRepoAndId,
  findNodeByAddress,
  findNodesByType,
  getIndexStats,
  indexExists,
  getIndexPathValue,
  getSqlitePathValue,
} from "./index-service";

// ============================================================================
// Seed Service
// ============================================================================
export {
  seedExampleData,
  clearAllData,
  needsSeeding,
} from "./seed";

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Initialize the Content Provider system.
 * Ensures the root structure exists and optionally seeds with example data.
 */
export async function initContentProvider(options: { seedIfEmpty?: boolean } = {}): Promise<{
  success: boolean;
  rootPath: string;
  message: string;
}> {
  const { seedIfEmpty = true } = options;

  try {
    // Ensure root structure exists
    const root = ensureContentProviderRoot();

    // Optionally seed with example data
    if (seedIfEmpty) {
      const needsSeed = await needsSeeding();
      if (needsSeed) {
        const seeded = await seedExampleData();
        if (!seeded) {
          return {
            success: false,
            rootPath: root.path,
            message: "Failed to seed example data",
          };
        }
      }
    }

    // Rebuild index if it doesn't exist
    if (!indexExists()) {
      const index = rebuildIndex();
      if (!index) {
        return {
          success: false,
          rootPath: root.path,
          message: "Failed to build index",
        };
      }
    }

    return {
      success: true,
      rootPath: root.path,
      message: "Content Provider initialized successfully",
    };
  } catch (error) {
    console.error("Error initializing Content Provider:", error);
    return {
      success: false,
      rootPath: getContentProviderRootPath(),
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}