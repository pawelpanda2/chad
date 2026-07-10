/**
 * Content Provider - Filesystem Utilities
 *
 * Low-level filesystem operations for the Content Provider system.
 */

import fs from "fs";
import path from "path";

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a path exists
 */
export function pathExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

/**
 * Check if a path is a directory
 */
export function isDirectory(dirPath: string): boolean {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

/**
 * Check if a path is a file
 */
export function isFile(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

/**
 * Read a file as string
 */
export function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

/**
 * Write a file with string content
 */
export function writeFile(filePath: string, content: string): boolean {
  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(filePath);
    ensureDirectory(parentDir);
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch (error) {
    console.error(`Error writing file ${filePath}:`, error);
    return false;
  }
}

/**
 * List files in a directory
 */
export function listFiles(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((file) => {
      const fullPath = path.join(dirPath, file);
      return fs.statSync(fullPath).isFile();
    });
  } catch (error) {
    console.error(`Error listing files in ${dirPath}:`, error);
    return [];
  }
}

/**
 * List directories in a directory
 */
export function listDirectories(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((dir) => {
      const fullPath = path.join(dirPath, dir);
      return fs.statSync(fullPath).isDirectory();
    });
  } catch (error) {
    console.error(`Error listing directories in ${dirPath}:`, error);
    return [];
  }
}

/**
 * List all subdirectories recursively
 */
export function listAllSubdirectories(dirPath: string, basePath: string = ""): string[] {
  const results: string[] = [];
  const dirs = listDirectories(dirPath);

  for (const dir of dirs) {
    const relativePath = basePath ? `${basePath}/${dir}` : dir;
    results.push(relativePath);
    const fullPath = path.join(dirPath, dir);
    results.push(...listAllSubdirectories(fullPath, relativePath));
  }

  return results;
}

/**
 * Parse YAML content to object
 * Simple YAML parser for basic key-value pairs and arrays of objects
 */
export function parseYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split("\n");

  let currentArrayKey: string | null = null;
  let currentArray: unknown[] = [];
  let currentObject: Record<string, unknown> | null = null;

  for (const line of lines) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Handle array items
    if (trimmed.startsWith("- ")) {
      if (currentArrayKey) {
        const value = trimmed.substring(2).trim();
        // If this line contains a colon, it's the start of an object in the array
        if (value.includes(":")) {
          // Save previous object if exists
          if (currentObject !== null) {
            currentArray.push(currentObject);
          }
          // Start new object
          currentObject = parseYamlObject(value);
        } else {
          // Simple value
          if (currentObject !== null) {
            currentArray.push(currentObject);
            currentObject = null;
          }
          currentArray.push(parseYamlValue(value));
        }
      }
      continue;
    }

    // Handle continuation of object in array (indented key-value pairs)
    if (currentObject !== null && trimmed.includes(":")) {
      const colonIndex = trimmed.indexOf(":");
      const key = trimmed.substring(0, colonIndex).trim();
      const valueStr = trimmed.substring(colonIndex + 1).trim();
      currentObject[key] = parseYamlValue(valueStr);
      continue;
    }

    // Handle key-value pairs
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      // If we were building an array, save it first
      if (currentArrayKey && currentArray.length > 0) {
        // Don't forget to push the last object
        if (currentObject !== null) {
          currentArray.push(currentObject);
          currentObject = null;
        }
        result[currentArrayKey] = currentArray;
        currentArray = [];
        currentArrayKey = null;
      }

      const key = trimmed.substring(0, colonIndex).trim();
      const valueStr = trimmed.substring(colonIndex + 1).trim();

      if (valueStr === "") {
        // This might be an array or nested object
        currentArrayKey = key;
        currentArray = [];
        currentObject = null;
      } else {
        result[key] = parseYamlValue(valueStr);
      }
    }
  }

  // Save any remaining array
  if (currentArrayKey && currentArray.length > 0) {
    // Don't forget to push the last object
    if (currentObject !== null) {
      currentArray.push(currentObject);
    }
    result[currentArrayKey] = currentArray;
  }

  return result;
}

/**
 * Parse a YAML object string like "userId: value1 role: value2"
 */
function parseYamlObject(str: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Split by spaces that are followed by a word and colon
  const parts = str.split(/(?=\w+:)/);
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed) {
      const colonIndex = trimmed.indexOf(":");
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        result[key] = parseYamlValue(value);
      }
    }
  }
  return result;
}

/**
 * Parse a YAML value string to appropriate type
 */
function parseYamlValue(valueStr: string): unknown {
  // Remove quotes
  if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
      (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
    return valueStr.slice(1, -1);
  }

  // Parse numbers
  if (/^-?\d+(\.\d+)?$/.test(valueStr)) {
    return parseFloat(valueStr);
  }

  // Parse booleans
  if (valueStr.toLowerCase() === "true") return true;
  if (valueStr.toLowerCase() === "false") return false;

  // Parse null
  if (valueStr.toLowerCase() === "null" || valueStr === "~") return null;

  return valueStr;
}

/**
 * Convert an object to YAML string
 * Simple YAML serializer for basic objects
 */
export function objectToYaml(obj: Record<string, unknown>, indent: number = 0): string {
  const lines: string[] = [];
  const spaces = "  ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      lines.push(`${spaces}${key}:`);
      for (const item of value) {
        if (typeof item === "object" && item !== null && !Array.isArray(item)) {
          const subYaml = objectToYaml(item as Record<string, unknown>, indent + 2);
          const subLines = subYaml.split("\n").filter((l) => l.trim());
          if (subLines.length > 0) {
            lines.push(`${spaces}  - ${subLines[0].trim()}`);
            for (let i = 1; i < subLines.length; i++) {
              lines.push(`${spaces}  ${subLines[i]}`);
            }
          }
        } else {
          lines.push(`${spaces}  - ${formatYamlValue(item)}`);
        }
      }
    } else if (typeof value === "object" && value !== null) {
      lines.push(`${spaces}${key}:`);
      lines.push(objectToYaml(value as Record<string, unknown>, indent + 1));
    } else {
      lines.push(`${spaces}${key}: ${formatYamlValue(value)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format a value for YAML output
 */
function formatYamlValue(value: unknown): string {
  if (typeof value === "string") {
    // Quote strings that might be ambiguous
    if (value.includes(":") || value.includes("#") || value.includes("\n")) {
      return `"${value}"`;
    }
    return value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null) return "null";
  return String(value);
}