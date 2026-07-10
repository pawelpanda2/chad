/**
 * Content Provider / DocStore - TypeScript Types
 *
 * This module defines all types for the Content Provider system,
 * which is a filesystem-based document store.
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * The two basic node types in the Content Provider system
 * Note: Ref is not used by AI/code for now, only Folder and Text
 */
export type CpNodeType = "Text" | "Folder";

// ============================================================================
// Node Configuration
// ============================================================================

/**
 * Configuration for a node, stored in config.yaml
 */
export interface CpNodeConfig {
  /** Unique identifier for this node (GUID) */
  id: string;
  /** Type of node */
  type: CpNodeType;
  /** Human-readable name */
  name: string;
  /** Current address/path in the tree structure */
  address: string;
  /** Optional: When this node was created */
  createdAt?: string;
  /** Optional: When this node was last updated */
  updatedAt?: string;
  /** Optional: Primary body file (defaults to body.txt) */
  primaryBody?: string;
  /** Optional: Format definitions */
  formats?: CpNodeFormat[];

}

/**
 * Format definition for a node's body files
 */
export interface CpNodeFormat {
  /** Filename of the format */
  filename: string;
  /** Format type (txt, json, yaml, hdr) */
  format: string;
  /** Role: primary, generated, backup */
  role: "primary" | "generated" | "backup";
  /** Optional: source file if generated */
  source?: string;
}

// ============================================================================
// Repository Configuration
// ============================================================================

/**
 * Permission entry for a repository
 */
export interface CpRepoPermission {
  /** User ID */
  userId: string;
  /** Role: owner, editor, reader, none */
  role: "owner" | "editor" | "reader" | "none";
}

/**
 * Configuration for a repository, stored in repos/{repoId}/config.yaml
 * Note: Repo root is just a Folder, not a separate "Repository" type
 */
export interface CpRepoConfig {
  /** Repository ID (GUID) */
  id: string;
  /** Repository name */
  name: string;
  /** Type identifier - always "Folder" for repo root */
  type: "Folder";
  /** When this repo was created */
  createdAt?: string;
  /** When this repo was last updated */
  updatedAt?: string;
}

// ============================================================================
// Node and File Representations
// ============================================================================

/**
 * Represents a node in the content provider system
 */
export interface CpNode {
  /** Full filesystem path to this node */
  path: string;
  /** Repository ID this node belongs to */
  repoId: string;
  /** Node configuration */
  config: CpNodeConfig;
  /** List of body files available */
  files: CpNodeFile[];
}

/**
 * Represents a body file within a node
 */
export interface CpNodeFile {
  /** Filename */
  filename: string;
  /** Full filesystem path */
  path: string;
  /** File type based on extension */
  type: "txt" | "json" | "yaml" | "hdr" | "unknown";
  /** Role: primary, generated, backup */
  role: "primary" | "generated" | "backup";
  /** Optional: if backup, the sequence number */
  version?: number;
}

// ============================================================================
// Repository Representation
// ============================================================================

/**
 * Represents a repository in the content provider system
 */
export interface CpRepo {
  /** Repository ID (GUID) */
  id: string;
  /** Repository name */
  name: string;
  /** Full filesystem path to repo root */
  path: string;
  /** Repository configuration */
  config: CpRepoConfig;
  /** Path to content folder */
  contentPath: string;
}

// ============================================================================
// Content Provider Root
// ============================================================================

/**
 * Represents the root of the Content Provider system
 */
export interface CpRoot {
  /** Root filesystem path */
  path: string;
  /** Path to .docstore folder */
  docstorePath: string;
  /** Path to index.json */
  indexPath: string;
  /** Path to index.sqlite */
  sqlitePath: string;
  /** Path to repos folder */
  reposPath: string;
}

// ============================================================================
// Index Structures
// ============================================================================

/**
 * Entry in the global index for a node
 */
export interface CpIndexNodeEntry {
  repoId: string;
  id: string;
  type: CpNodeType;
  name: string;
  address: string;
  path: string;
  primaryBody?: string;
}


/**
 * Global index structure stored in .docstore/index.json
 */
export interface CpGlobalIndex {
  nodes: Record<string, CpIndexNodeEntry>;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response for listing repositories
 */
export interface CpListReposResponse {
  repos: CpRepoSummary[];
}

/**
 * Summary of a repository for listing
 */
export interface CpRepoSummary {
  id: string;
  name: string;
  path: string;
}

/**
 * Response for listing nodes
 */
export interface CpListNodesResponse {
  nodes: CpNodeSummary[];
}

/**
 * Summary of a node for listing
 */
export interface CpNodeSummary {
  id: string;
  type: CpNodeType;
  name: string;
  address: string;
  path: string;
}

/**
 * Response for getting a single node
 */
export interface CpGetNodeResponse {
  node: CpNodeDetail;
  resolved?: boolean;
  resolvedFrom?: string;
}

/**
 * Detailed node information including files
 */
export interface CpNodeDetail {
  id: string;
  type: CpNodeType;
  name: string;
  address: string;
  path: string;
  repoId: string;
  files: CpNodeFileSummary[];
  config?: CpNodeConfig;
}

/**
 * Summary of a node file
 */
export interface CpNodeFileSummary {
  filename: string;
  type: string;
  role: string;
  path: string;
}

// ============================================================================
// Options Types
// ============================================================================

/**
 * Options for resolving references
 */
export interface CpResolveRefOptions {
  /** Maximum depth for resolving chained references */
  maxDepth?: number;
  /** Whether to resolve references (default: true) */
  resolve?: boolean;
}

/**
 * Options for listing nodes
 */
export interface CpListNodesOptions {
  /** Filter by node type */
  type?: CpNodeType;
  /** Whether to include only direct children of root */
  recursive?: boolean;
}