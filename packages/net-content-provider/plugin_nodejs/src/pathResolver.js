const path = require('path');
const config = require('./config');

/**
 * Parses and validates the address parameter.
 * 
 * Supported formats:
 * 1. UUID-local: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02-003-02
 * 2. UUID only: 0fc7da8d-3466-4964-a24c-dfc0d0fef87c
 * 3. 32-hex-chars-local: 6a2c9428afbc81918be759b6e4e8493d-01-02-003-02
 * 4. 32-hex-chars only: 6a2c9428afbc81918be759b6e4e8493d
 * 
 * @param {string} address - The address string to parse
 * @returns {{ repoGuid: string, local: string|null, localPath: string|null }} Parsed address components
 * @throws {Error} If address format is invalid
 */
function parseAddress(address) {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required and must be a string');
  }

  // UUID format: 8-4-4-4-12 hex chars (e.g., 0fc7da8d-3466-4964-a24c-dfc0d0fef87c)
  const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  
  // UUID with local: UUID-local (e.g., 0fc7da8d-3466-4964-a24c-dfc0d0fef87c-01-02)
  const uuidWithLocalPattern = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})-(.+)$/;
  
  // 32 hex chars only (e.g., 6a2c9428afbc81918be759b6e4e8493d)
  const hex32Pattern = /^[0-9a-fA-F]{32}$/;
  
  // 32 hex chars with local (e.g., 6a2c9428afbc81918be759b6e4e8493d-01-02)
  const hex32WithLocalPattern = /^([0-9a-fA-F]{32})-(.+)$/;

  let repoGuid = null;
  let local = null;

  // Try UUID with local first
  let match = address.match(uuidWithLocalPattern);
  if (match) {
    repoGuid = match[1];
    local = match[2];
  }
  // Try UUID only
  else if (uuidPattern.test(address)) {
    repoGuid = address;
  }
  // Try 32 hex chars with local
  else {
    match = address.match(hex32WithLocalPattern);
    if (match) {
      repoGuid = match[1];
      local = match[2];
    }
    // Try 32 hex chars only
    else if (hex32Pattern.test(address)) {
      repoGuid = address;
    }
    else {
      throw new Error('Invalid address format. Expected: {UUID}-{local} or {32-hex-chars}-{local} or just {UUID} or {32-hex-chars}');
    }
  }

  let localPath = null;
  if (local) {
    // Validate local part - only digits and dashes allowed
    if (!/^[0-9-]+$/.test(local)) {
      throw new Error('Local part must contain only digits and dashes');
    }
    // Convert dashes to slashes for file path
    localPath = local.replace(/-/g, '/');
  }

  return { repoGuid, local, localPath };
}

/**
 * Resolves the full path for a given address and file type.
 * 
 * @param {string} address - The address string
 * @param {string} fileName - Optional file name to append (e.g., 'config.yaml', 'body.txt')
 * @returns {string} The resolved full path
 * @throws {Error} If path validation fails
 */
function resolvePath(address, fileName = null) {
  const { repoGuid, localPath } = parseAddress(address);

  let fullPath;
  if (localPath) {
    fullPath = path.join(config.pluginRoot, repoGuid, localPath);
  } else {
    // Just the repoGuid (UUID or 32-hex), no local subfolder
    fullPath = path.join(config.pluginRoot, repoGuid);
  }
  
  if (fileName) {
    fullPath = path.join(fullPath, fileName);
  }

  // Normalize the path to resolve any . or .. 
  const normalizedPath = path.normalize(fullPath);

  // Security check: ensure the path is within PLUGIN_ROOT
  if (!normalizedPath.startsWith(path.normalize(config.pluginRoot))) {
    throw new Error('Invalid path: access denied');
  }

  return normalizedPath;
}

module.exports = {
  parseAddress,
  resolvePath
};