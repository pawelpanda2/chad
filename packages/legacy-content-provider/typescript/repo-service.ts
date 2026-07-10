/**
 * Content Provider - Repository Service
 *
 * Handles repository-level operations for the Content Provider system.
 */

import {
  getContentProviderRootPath,
  getReposPath,
  getRepoPath,
  getRepoConfigPath,
  getRepoContentPath,
} from "./config";
import {
  ensureDirectory,
  pathExists,
  isDirectory,
  listDirectories,
  readFile,
  writeFile,
  parseYaml,
  objectToYaml,
} from "./fs-utils";
import type { CpRepo, CpRepoConfig, CpRoot } from "./types";

/**
 * Ensure the Content Provider root directory structure exists.
 * Creates cp-root, .docstore, and repos directories if they don't exist.
 */
export function ensureContentProviderRoot(): CpRoot {
  const rootPath = getContentProviderRootPath();
  const docstorePath = `${rootPath}/.docstore`;
  const reposPath = getReposPath();

  ensureDirectory(rootPath);
  ensureDirectory(docstorePath);
  ensureDirectory(reposPath);

  return {
    path: rootPath,
    docstorePath,
    indexPath: `${docstorePath}/index.json`,
    sqlitePath: `${docstorePath}/index.sqlite`,
    reposPath,
  };
}

/**
 * Get the Content Provider root information
 */
export function getContentProviderRoot(): CpRoot {
  const rootPath = getContentProviderRootPath();
  return {
    path: rootPath,
    docstorePath: `${rootPath}/.docstore`,
    indexPath: `${rootPath}/.docstore/index.json`,
    sqlitePath: `${rootPath}/.docstore/index.sqlite`,
    reposPath: getReposPath(),
  };
}

/**
 * List all repositories in the Content Provider system
 */
export function listRepos(): CpRepo[] {
  const reposPath = getReposPath();

  if (!pathExists(reposPath) || !isDirectory(reposPath)) {
    return [];
  }

  const repoDirs = listDirectories(reposPath);
  const repos: CpRepo[] = [];

  for (const repoDir of repoDirs) {
    const repo = readRepo(repoDir);
    if (repo) {
      repos.push(repo);
    }
  }

  return repos;
}

/**
 * Read a repository by ID
 */
export function readRepo(repoId: string): CpRepo | null {
  const repoPath = getRepoPath(repoId);
  const configPath = getRepoConfigPath(repoId);
  const contentPath = getRepoContentPath(repoId);

  if (!pathExists(repoPath) || !isDirectory(repoPath)) {
    return null;
  }

  const config = readRepoConfig(repoId);
  if (!config) {
    return null;
  }

  return {
    id: repoId,
    name: config.name,
    path: repoPath,
    config,
    contentPath,
  };
}

/**
 * Read a repository's config.yaml
 */
export function readRepoConfig(repoId: string): CpRepoConfig | null {
  const configPath = getRepoConfigPath(repoId);
  const content = readFile(configPath);

  if (!content) {
    return null;
  }

  const parsed = parseYaml(content) as Partial<CpRepoConfig>;

  return {
    id: parsed.id as string,
    name: parsed.name as string,
    type: "Folder",
    createdAt: parsed.createdAt as string | undefined,
    updatedAt: parsed.updatedAt as string | undefined,
  };
}

/**
 * Write a repository's config.yaml
 */
export function writeRepoConfig(repoId: string, config: CpRepoConfig): boolean {
  const configPath = getRepoConfigPath(repoId);
  const yamlContent = objectToYaml(config as unknown as Record<string, unknown>);
  return writeFile(configPath, yamlContent);
}

/**
 * Create a new repository
 */
export function createRepo(config: CpRepoConfig): CpRepo | null {
  const repoId = config.id;
  const repoPath = getRepoPath(repoId);

  if (pathExists(repoPath)) {
    console.error(`Repository ${repoId} already exists`);
    return null;
  }

  // Create repository structure
  ensureDirectory(repoPath);
  ensureDirectory(getRepoContentPath(repoId));

  // Write config
  if (!writeRepoConfig(repoId, config)) {
    console.error(`Failed to write config for repository ${repoId}`);
    return null;
  }

  return readRepo(repoId);
}

/**
 * Delete a repository
 */
export async function deleteRepo(repoId: string): Promise<boolean> {
  const repoPath = getRepoPath(repoId);

  if (!pathExists(repoPath)) {
    return false;
  }

  try {
    // We need to use fs directly for recursive delete
    const fs = await import("fs");
    fs.rmSync(repoPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Error deleting repository ${repoId}:`, error);
    return false;
  }
}

/**
 * Check if a repository exists
 */
export function repoExists(repoId: string): boolean {
  const repoPath = getRepoPath(repoId);
  return pathExists(repoPath) && isDirectory(repoPath);
}

/**
 * Get repository summary for listing
 */
export function getRepoSummary(repoId: string): { id: string; name: string; path: string } | null {
  const repo = readRepo(repoId);
  if (!repo) return null;

  return {
    id: repo.id,
    name: repo.name,
    path: repo.path,
  };
}