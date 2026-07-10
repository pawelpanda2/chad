/**
 * Content Provider - Seed Service
 *
 * Creates example Content Provider structure for testing and demonstration.
 */

import {
  getContentProviderRootPath,
  getDocstorePath,
  getReposPath,
} from "./config";
import { ensureDirectory, pathExists } from "./fs-utils";
import { createRepo } from "./repo-service";
import { createNode, writeNodeFile } from "./node-service";
import { rebuildIndex } from "./index-service";
import type { CpRepoConfig, CpNodeConfig } from "./types";

/**
 * Get the current date in ISO format
 */
function getNow(): string {
  return new Date().toISOString();
}

/**
 * Seed the Content Provider with example data
 * Creates a minimal example structure if cp-root doesn't exist or is empty
 */
export async function seedExampleData(): Promise<boolean> {
  const rootPath = getContentProviderRootPath();

  // Check if already seeded
  if (pathExists(rootPath) && pathExists(getReposPath())) {
    const repos = getReposPath();
    const fs = await import("fs");
    const dirs = fs.readdirSync(repos).filter((d: string) => {
      const full = `${repos}/${d}`;
      return fs.statSync(full).isDirectory();
    });
    if (dirs.length > 0) {
      console.log("Content Provider already has data, skipping seed");
      return true;
    }
  }

  console.log("Seeding Content Provider with example data...");

  // Ensure root structure exists
  ensureDirectory(rootPath);
  ensureDirectory(getDocstorePath());
  ensureDirectory(getReposPath());

  // Generate IDs
  const repoId = "0fc7da8d-3466-4964-a24c-dfc0d0fef87c";
  const rootFolderId = "11111111-1111-1111-1111-111111111111";
  const textNodeId = "91300cf5-2b72-4a8f-8a9d-bf7df9d6c9da";
  const now = getNow();

  // Create repository config
  // Note: type is "Folder", not "Repository" - repo root is just a Folder
  const repoConfig: CpRepoConfig = {
    id: repoId,
    name: "Main Repository",
    type: "Folder",
    createdAt: now,
    updatedAt: now,
  };

  // Create repository
  const repo = createRepo(repoConfig);
  if (!repo) {
    console.error("Failed to create seed repository");
    return false;
  }

  // Create root Folder node (Active) with numeric address "01"
  // Note: folder name is "Active" but address is "01" (numeric)
  const folderConfig: CpNodeConfig = {
    id: rootFolderId,
    type: "Folder",
    name: "Active",
    address: "01",
    createdAt: now,
    updatedAt: now,
  };

  const folder = createNode(repoId, "01", folderConfig);
  if (!folder) {
    console.error("Failed to create seed folder node");
    return false;
  }

  // Create Text node inside the folder with numeric address
  // Note: address is "01/05/44" (all numeric), not "Active/05/44"
  const textNodeAddress = "01/05/44";
  const textNodeConfig: CpNodeConfig = {
    id: textNodeId,
    type: "Text",
    name: "Target Document",
    address: textNodeAddress,
    createdAt: now,
    updatedAt: now,
    primaryBody: "body.txt",
  };

  const textNode = createNode(repoId, textNodeAddress, textNodeConfig);
  if (!textNode) {
    console.error("Failed to create seed text node");
    return false;
  }

  // Write body content for the text node
  const bodyContent = `# Target Document

This is an example document created by the Content Provider seed.

## Features

- This document demonstrates the Text node type
- It contains multiple body files
- It can be referenced by Ref nodes

## Body Files

- body.txt - This primary text content
- body.json - JSON representation (generated)
- body.yaml - YAML representation (generated)
- body-01.txt - Historical version

---

*Created: ${now}*
`;

  writeNodeFile(repoId, textNodeAddress, "body.txt", bodyContent);

  // Create a JSON version
  const jsonContent = JSON.stringify(
    {
      title: "Target Document",
      content: "This is an example document created by the Content Provider seed.",
      features: [
        "This document demonstrates the Text node type",
        "It contains multiple body files",
        "It can be referenced by Ref nodes",
      ],
      createdAt: now,
    },
    null,
    2
  );
  writeNodeFile(repoId, textNodeAddress, "body.json", jsonContent);

  // Create a YAML version
  const yamlContent = `title: "Target Document"
content: "This is an example document created by the Content Provider seed."
features:
  - "This document demonstrates the Text node type"
  - "It contains multiple body files"
  - "It can be referenced by Ref nodes"
createdAt: "${now}"
`;
  writeNodeFile(repoId, textNodeAddress, "body.yaml", yamlContent);

  // Create a backup version
  const backupContent = `# Old version of the document

This is a backup/historical version of the content.
`;
  writeNodeFile(repoId, textNodeAddress, "body-01.txt", backupContent);

  // Rebuild the index
  const index = rebuildIndex();
  if (!index) {
    console.error("Failed to rebuild index after seeding");
    return false;
  }

  console.log("Content Provider seeded successfully!");
  console.log(`  Repository: ${repoId}`);
  console.log(`  Root folder: 01 (${rootFolderId}) - name: "Active"`);
  console.log(`  Text node: ${textNodeAddress} (${textNodeId})`);

  return true;
}

/**
 * Clear all data from the Content Provider
 * Use with caution - this deletes everything!
 */
export async function clearAllData(): Promise<boolean> {
  const reposPath = getReposPath();

  if (!pathExists(reposPath)) {
    return true;
  }

  try {
    const fs = await import("fs");
    fs.rmSync(reposPath, { recursive: true, force: true });
    ensureDirectory(reposPath);

    // Also clear the index
    const indexPath = `${getDocstorePath()}/index.json`;
    if (pathExists(indexPath)) {
      fs.unlinkSync(indexPath);
    }

    console.log("Content Provider data cleared");
    return true;
  } catch (error) {
    console.error("Error clearing Content Provider data:", error);
    return false;
  }
}

/**
 * Check if the Content Provider needs seeding
 */
export async function needsSeeding(): Promise<boolean> {
  const reposPath = getReposPath();

  if (!pathExists(reposPath)) {
    return true;
  }

  try {
    const fs = await import("fs");
    const dirs = fs.readdirSync(reposPath).filter((d: string) => {
      const full = `${reposPath}/${d}`;
      return fs.statSync(full).isDirectory();
    });
    return dirs.length === 0;
  } catch {
    return true;
  }
}