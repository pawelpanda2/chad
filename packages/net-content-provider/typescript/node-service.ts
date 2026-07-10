/**
 * Content Provider - Node Service
 *
 * Handles node-level operations for the Content Provider system.
 */

import path from "path";
import {
  getRepoContentPath,
  getNodePath,
  getNodeConfigPath,
} from "./config";
import {
  ensureDirectory,
  pathExists,
  isDirectory,
  isFile,
  listFiles,
  listDirectories,
  listAllSubdirectories,
  readFile,
  writeFile,
  parseYaml,
  objectToYaml,
} from "./fs-utils";
import type {
  CpNode,
  CpNodeConfig,
  CpNodeFile,
  CpNodeType,
  CpRepoConfig,
} from "./types";
import { repoExists } from "./repo-service";

/**
 * List all nodes in a repository
 */
export function listNodes(repoId: string): CpNode[] {
  const contentPath = getRepoContentPath(repoId);

  if (!pathExists(contentPath) || !isDirectory(contentPath)) {
    return [];
  }

  // Find all directories that contain a config.yaml
  const allDirs = listAllSubdirectories(contentPath);
  const nodes: CpNode[] = [];

  // Also check the root content directory
  const rootNode = readNodeByAddress(repoId, "");
  if (rootNode) {
    nodes.push(rootNode);
  }

  for (const dir of allDirs) {
    const node = readNodeByAddress(repoId, dir);
    if (node) {
      nodes.push(node);
    }
  }

  return nodes;
}

/**
 * Read a node by its address
 */
export function readNodeByAddress(repoId: string, address: string): CpNode | null {
  const nodePath = getNodePath(repoId, address);
  const configPath = getNodeConfigPath(repoId, address);

  if (!pathExists(nodePath) || !isDirectory(nodePath)) {
    return null;
  }

  const config = readNodeConfig(repoId, address);
  if (!config) {
    return null;
  }

  const files = getNodeFiles(repoId, address);

  return {
    path: nodePath,
    repoId,
    config,
    files,
  };
}

/**
 * Read a node by its ID (searches through all nodes in the repo)
 */
export function readNodeById(repoId: string, nodeId: string): CpNode | null {
  const nodes = listNodes(repoId);
  return nodes.find((n) => n.config.id === nodeId) || null;
}

/**
 * Read a node's config.yaml
 */
export function readNodeConfig(repoId: string, address: string): CpNodeConfig | null {
  const configPath = getNodeConfigPath(repoId, address);
  const content = readFile(configPath);

  if (!content) {
    return null;
  }

  const parsed = parseYaml(content) as Partial<CpNodeConfig>;

  return {
    id: parsed.id as string,
    type: parsed.type as CpNodeType,
    name: parsed.name as string,
    address: parsed.address as string,
    createdAt: parsed.createdAt as string | undefined,
    updatedAt: parsed.updatedAt as string | undefined,
    primaryBody: parsed.primaryBody as string | undefined,
    formats: parsed.formats as CpNodeConfig["formats"],
  };
}

/**
 * Write a node's config.yaml
 */
export function writeNodeConfig(repoId: string, address: string, config: CpNodeConfig): boolean {
  const configPath = getNodeConfigPath(repoId, address);
  const yamlContent = objectToYaml(config as unknown as Record<string, unknown>);
  return writeFile(configPath, yamlContent);
}

/**
 * Get list of body files for a node
 */
export function getNodeFiles(repoId: string, address: string): CpNodeFile[] {
  const nodePath = getNodePath(repoId, address);
  const files = listFiles(nodePath);
  const nodeFiles: CpNodeFile[] = [];

  for (const file of files) {
    if (file === "config.yaml") continue;

    const filePath = path.join(nodePath, file);
    const fileInfo = parseBodyFilename(file);

    if (fileInfo) {
      nodeFiles.push({
        filename: file,
        path: filePath,
        type: fileInfo.type,
        role: fileInfo.role,
        version: fileInfo.version,
      });
    }
  }

  // Sort: primary first, then by version
  nodeFiles.sort((a, b) => {
    if (a.role === "primary" && b.role !== "primary") return -1;
    if (b.role === "primary" && a.role !== "primary") return 1;
    if (a.version && b.version) return a.version - b.version;
    return 0;
  });

  return nodeFiles;
}

/**
 * Parse a body filename to extract type and role
 */
function parseBodyFilename(filename: string): {
  type: CpNodeFile["type"];
  role: CpNodeFile["role"];
  version?: number;
} | null {
  // Match body.txt, body.json, body.yaml, body.hdr
  const primaryMatch = filename.match(/^body\.(txt|json|yaml|hdr)$/);
  if (primaryMatch) {
    return {
      type: primaryMatch[1] as CpNodeFile["type"],
      role: "primary",
    };
  }

  // Match body-01.txt, body-02.txt, etc.
  const versionMatch = filename.match(/^body-(\d+)\.(txt|json|yaml|hdr)$/);
  if (versionMatch) {
    return {
      type: versionMatch[2] as CpNodeFile["type"],
      role: "backup",
      version: parseInt(versionMatch[1]),
    };
  }

  // Match body-backup-*.txt or other patterns
  const backupMatch = filename.match(/^body-backup-.*\.(txt|json|yaml|hdr)$/);
  if (backupMatch) {
    return {
      type: backupMatch[1] as CpNodeFile["type"],
      role: "backup",
    };
  }

  return null;
}

/**
 * Read the content of a body file
 */
export function readNodeFile(repoId: string, address: string, filename: string): string | null {
  const nodePath = getNodePath(repoId, address);
  const filePath = path.join(nodePath, filename);

  if (!isFile(filePath)) {
    return null;
  }

  return readFile(filePath);
}

/**
 * Create a new node
 */
export function createNode(
  repoId: string,
  address: string,
  config: CpNodeConfig
): CpNode | null {
  const nodePath = getNodePath(repoId, address);

  if (pathExists(nodePath)) {
    console.error(`Node at address ${address} already exists in repo ${repoId}`);
    return null;
  }

  // Create node directory
  ensureDirectory(nodePath);

  // Write config
  if (!writeNodeConfig(repoId, address, config)) {
    console.error(`Failed to write config for node at ${address}`);
    return null;
  }

  return readNodeByAddress(repoId, address);
}

/**
 * Delete a node
 */
export async function deleteNode(repoId: string, address: string): Promise<boolean> {
  const nodePath = getNodePath(repoId, address);

  if (!pathExists(nodePath)) {
    return false;
  }

  try {
    const fs = await import("fs");
    fs.rmSync(nodePath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Error deleting node at ${address}:`, error);
    return false;
  }
}

/**
 * Move a node to a new address
 */
export async function moveNode(repoId: string, fromAddress: string, toAddress: string): Promise<CpNode | null> {
  const fromPath = getNodePath(repoId, fromAddress);
  const toPath = getNodePath(repoId, toAddress);

  if (!pathExists(fromPath)) {
    console.error(`Source node at ${fromAddress} does not exist`);
    return null;
  }

  if (pathExists(toPath)) {
    console.error(`Target address ${toAddress} already exists`);
    return null;
  }

  try {
    const fs = await import("fs");
    fs.renameSync(fromPath, toPath);

    // Update the config.yaml with new address
    const newConfig = readNodeConfig(repoId, toAddress);
    if (newConfig) {
      newConfig.address = toAddress.replace(/\//g, "/");
      writeNodeConfig(repoId, toAddress, newConfig);
    }

    return readNodeByAddress(repoId, toAddress);
  } catch (error) {
    console.error(`Error moving node from ${fromAddress} to ${toAddress}:`, error);
    return null;
  }
}

/**
 * Check if a node exists at an address
 */
export function nodeExists(repoId: string, address: string): boolean {
  const nodePath = getNodePath(repoId, address);
  return pathExists(nodePath) && isDirectory(nodePath);
}

/**
 * Get node summary for listing
 */
export function getNodeSummary(
  repoId: string,
  address: string
): { id: string; type: CpNodeType; name: string; address: string; path: string } | null {
  const node = readNodeByAddress(repoId, address);
  if (!node) return null;

  return {
    id: node.config.id,
    type: node.config.type,
    name: node.config.name,
    address: node.config.address,
    path: node.path,
  };
}

/**
 * Write content to a body file
 */
export function writeNodeFile(
  repoId: string,
  address: string,
  filename: string,
  content: string
): boolean {
  const nodePath = getNodePath(repoId, address);
  const filePath = path.join(nodePath, filename);
  return writeFile(filePath, content);
}

/**
 * Find a node by logical names (from config.yaml name field)
 * 
 * @param repoId - Repository GUID
 * @param names - Sequence of logical names (e.g., "users", "users-list")
 * @returns The found node with body content if primaryBody is set
 */
export function getByNames(
  repoId: string,
  ...names: string[]
): CpNode & { body?: Record<string, unknown> } | null {
  if (names.length === 0) {
    return null;
  }

  // Start from content root
  let currentAddress = "";
  
  // Navigate through each name
  for (const targetName of names) {
    // List all nodes at current level
    const contentPath = currentAddress 
      ? getNodePath(repoId, currentAddress)
      : getRepoContentPath(repoId);
    
    if (!pathExists(contentPath) || !isDirectory(contentPath)) {
      return null;
    }

    // Find child with matching name
    const children = listDirectories(contentPath);
    let foundChild = false;
    
    for (const childDir of children) {
      const childAddress = currentAddress 
        ? `${currentAddress}/${childDir}`
        : childDir;
      
      const childConfig = readNodeConfig(repoId, childAddress);
      if (childConfig && childConfig.name === targetName) {
        currentAddress = childAddress;
        foundChild = true;
        break;
      }
    }

    if (!foundChild) {
      return null;
    }
  }

  // Read the final node
  const node = readNodeByAddress(repoId, currentAddress);
  if (!node) {
    return null;
  }

  // If node has primaryBody, read the body content
  if (node.config.primaryBody) {
    const bodyContent = readNodeFile(repoId, currentAddress, node.config.primaryBody);
    if (bodyContent) {
      const parsedBody = parseYaml(bodyContent) as Record<string, unknown>;
      return {
        ...node,
        body: parsedBody,
      };
    }
  }

  return node;
}
