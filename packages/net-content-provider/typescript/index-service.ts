/**
 * Content Provider - Index Service
 *
 * Handles global index operations for the Content Provider system.
 * The index provides fast lookup of nodes across all repositories.
 */

import {
  getIndexPath,
  getSqlitePath,
} from "./config";
import {
  ensureDirectory,
  pathExists,
  readFile,
  writeFile,
  listDirectories,
} from "./fs-utils";
import { listRepos, readRepo } from "./repo-service";
import { listNodes, readNodeByAddress } from "./node-service";
import type {
  CpGlobalIndex,
  CpIndexNodeEntry,
} from "./types";

/**
 * Rebuild the global index by scanning all repositories and nodes
 */
export function rebuildIndex(): CpGlobalIndex | null {
  const indexPath = getIndexPath();
  const sqlitePath = getSqlitePath();

  // Ensure .docstore directory exists
  ensureDirectory(indexPath.replace("/index.json", ""));

  const index: CpGlobalIndex = {
    nodes: {},
  };

  // Get all repositories
  const repos = listRepos();

  for (const repo of repos) {
    // Get all nodes in this repository
    const nodes = listNodes(repo.id);

    for (const node of nodes) {
      // Create index entry for the node
      const nodeKey = `${repo.id}:${node.config.id}`;
      const nodeEntry: CpIndexNodeEntry = {
        repoId: repo.id,
        id: node.config.id,
        type: node.config.type,
        name: node.config.name,
        address: node.config.address,
        path: node.path,
        primaryBody: node.config.primaryBody,
      };

      index.nodes[nodeKey] = nodeEntry;
    }
  }

  // Write index to JSON file
  const success = writeFile(indexPath, JSON.stringify(index, null, 2));

  if (!success) {
    console.error("Failed to write index.json");
    return null;
  }

  // Note: SQLite index preparation is for future implementation
  // The file path is reserved but not yet used
  if (!pathExists(sqlitePath)) {
    // Create empty file as placeholder
    writeFile(sqlitePath, "");
  }

  return index;
}

/**
 * Read the global index from disk
 */
export function readIndex(): CpGlobalIndex | null {
  const indexPath = getIndexPath();
  const content = readFile(indexPath);

  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as CpGlobalIndex;
  } catch (error) {
    console.error("Error parsing index.json:", error);
    return null;
  }
}

/**
 * Find a node by ID using the index
 */
export function findNodeById(nodeId: string): CpIndexNodeEntry | null {
  const index = readIndex();
  if (!index) return null;

  // Search through all nodes
  for (const key of Object.keys(index.nodes)) {
    const entry = index.nodes[key];
    if (entry.id === nodeId) {
      return entry;
    }
  }

  return null;
}

/**
 * Find a node by repo ID and node ID
 */
export function findNodeByRepoAndId(repoId: string, nodeId: string): CpIndexNodeEntry | null {
  const index = readIndex();
  if (!index) return null;

  const key = `${repoId}:${nodeId}`;
  return index.nodes[key] || null;
}

/**
 * Find a node by repo ID and address
 */
export function findNodeByAddress(repoId: string, address: string): CpIndexNodeEntry | null {
  const index = readIndex();
  if (!index) return null;

  // Search through all nodes in this repo
  for (const key of Object.keys(index.nodes)) {
    const entry = index.nodes[key];
    if (entry.repoId === repoId && entry.address === address) {
      return entry;
    }
  }

  return null;
}

/**
 * Find all nodes by type
 */
export function findNodesByType(type: string): CpIndexNodeEntry[] {
  const index = readIndex();
  if (!index) return [];

  const results: CpIndexNodeEntry[] = [];
  for (const key of Object.keys(index.nodes)) {
    const entry = index.nodes[key];
    if (entry.type === type) {
      results.push(entry);
    }
  }

  return results;
}

/**
 * Get index statistics
 */
export function getIndexStats(): {
  totalNodes: number;
  nodesByType: Record<string, number>;
  totalRepos: number;
} {
  const index = readIndex();
  if (!index) {
    return {
      totalNodes: 0,
      nodesByType: {},
      totalRepos: 0,
    };
  }

  const nodesByType: Record<string, number> = {};
  const repos = new Set<string>();

  for (const key of Object.keys(index.nodes)) {
    const entry = index.nodes[key];
    repos.add(entry.repoId);
    nodesByType[entry.type] = (nodesByType[entry.type] || 0) + 1;
  }

  return {
    totalNodes: Object.keys(index.nodes).length,
    nodesByType,
    totalRepos: repos.size,
  };
}

/**
 * Check if the index exists and is valid
 */
export function indexExists(): boolean {
  const indexPath = getIndexPath();
  return pathExists(indexPath);
}

/**
 * Get the path to the index file
 */
export function getIndexPathValue(): string {
  return getIndexPath();
}

/**
 * Get the path to the SQLite file (reserved for future use)
 */
export function getSqlitePathValue(): string {
  return getSqlitePath();
}