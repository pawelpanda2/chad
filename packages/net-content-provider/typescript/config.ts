/**
 * Content Provider - Configuration
 *
 * Handles configuration and path resolution for the Content Provider system.
 */

import path from "path";

/**
 * Environment variable name for Content Provider root path
 */
const CP_ROOT_ENV_VAR = "CONTENT_PROVIDER_ROOT_PATH";

/**
 * Default relative path for Content Provider root
 */
const DEFAULT_CP_ROOT_PATH = "./cp-root";

/**
 * Get the root path for the Content Provider system.
 * Uses environment variable if set, otherwise defaults to ./cp-root
 */
export function getContentProviderRootPath(): string {
  const envPath = process.env[CP_ROOT_ENV_VAR];
  if (envPath) {
    // If it's an absolute path, use it directly
    if (path.isAbsolute(envPath)) {
      return envPath;
    }
    // If it's relative, resolve from current working directory
    return path.resolve(process.cwd(), envPath);
  }
  // Default to ./cp-root in the current working directory
  return path.resolve(process.cwd(), DEFAULT_CP_ROOT_PATH);
}

/**
 * Get the path to the .docstore folder
 */
export function getDocstorePath(): string {
  return path.join(getContentProviderRootPath(), ".docstore");
}

/**
 * Get the path to the index.json file
 */
export function getIndexPath(): string {
  return path.join(getDocstorePath(), "index.json");
}

/**
 * Get the path to the index.sqlite file
 */
export function getSqlitePath(): string {
  return path.join(getDocstorePath(), "index.sqlite");
}

/**
 * Get the path to the repos folder
 */
export function getReposPath(): string {
  return path.join(getContentProviderRootPath(), "repos");
}

/**
 * Get the path to a specific repository
 */
export function getRepoPath(repoId: string): string {
  return path.join(getReposPath(), repoId);
}

/**
 * Get the path to a repository's config.yaml
 */
export function getRepoConfigPath(repoId: string): string {
  return path.join(getRepoPath(repoId), "config.yaml");
}

/**
 * Get the path to a repository's nodes folder
 * Note: Nodes are stored directly in the repo folder, NOT in a content/ subfolder
 */
export function getRepoContentPath(repoId: string): string {
  return getRepoPath(repoId);
}

/**
 * Get the path to a node by address
 * Nodes are stored directly in the repo folder with numeric addresses
 */
export function getNodePath(repoId: string, address: string): string {
  return path.join(getRepoPath(repoId), address);
}

/**
 * Get the path to a node's config.yaml
 */
export function getNodeConfigPath(repoId: string, address: string): string {
  return path.join(getNodePath(repoId, address), "config.yaml");
}

/**
 * Get the environment variable name for Content Provider root path
 */
export function getRootPathEnvVarName(): string {
  return CP_ROOT_ENV_VAR;
}