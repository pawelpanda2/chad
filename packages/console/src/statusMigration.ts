/**
 * Status Migration Module
 * 
 * Provides shared functions for migrating status items to the new standard format.
 * Both "Migration without preview" and "Migration with preview" use these functions.
 */

/**
 * Standard fields in the new status format, in order.
 */
export const STATUS_STANDARD_FIELDS = [
  "city",
  "only-friends",
  "her-first-msg",
  "your-first-message",
  "writing-deadline",
  "priority-today"
];

/**
 * Default values for new standard fields.
 * Only `city` can be empty; all others must have explicit defaults.
 */
export const STATUS_DEFAULTS: Record<string, string> = {
  "city": "",
  "only-friends": "false",
  "her-first-msg": "false",
  "your-first-message": "false",
  "writing-deadline": "2099-01-01",
  "priority-today": "0"
};

/**
 * Old field names mapped to new field names.
 */
export const STATUS_FIELD_ALIASES: Record<string, string> = {
  "her-fist-msg": "her-first-msg",
  "your-fist-message": "your-first-message",
  "writing deadline": "writing-deadline"
};

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parses a status body into a key-value map.
 * Each line is independent - next line is NEVER the value of previous field.
 * - `key: value` => key = "value"
 * - `key:` => key = ""
 */
export function parseStatusBody(body: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();

    if (!key) continue;

    result[key] = value;
  }

  return result;
}

/**
 * Extracts the STATUS_LOCA from an address by removing the first segment.
 * Examples:
 *   "girls/06/61/02/01" -> "06/61/02/01"
 *   "Active/06/61/02/01" -> "06/61/02/01"
 */
export function getStatusLoca(address: string): string {
  if (!address) return "";

  // Normalize: replace "Active" with "girls"
  let normalizedAddress = address;
  if (normalizedAddress.startsWith("Active/")) {
    normalizedAddress = "girls/" + normalizedAddress.substring(7);
  }

  const slashIndex = normalizedAddress.indexOf("/");
  if (slashIndex === -1) return "";

  return normalizedAddress.substring(slashIndex + 1);
}

/**
 * Gets a display value for a field.
 * Returns "[empty]" for empty values, otherwise the actual value.
 */
export function displayStatusValue(value: string | undefined): string {
  return value === "" || value === undefined ? "[empty]" : value;
}

/**
 * Normalizes a field value based on the field type.
 * - Boolean fields: converts to "true" or "false"
 * - Empty fields: returns the default value
 * - Other fields: returns the value as-is
 */
export function normalizeStatusValue(field: string, value: string | undefined): string {
  const val = value || "";

  // For boolean fields, ensure proper value
  if (field === "only-friends" || field === "her-first-msg" || field === "your-first-message") {
    if (val === "true" || val === "false") {
      return val;
    }
    return STATUS_DEFAULTS[field] || "false";
  }

  // For writing-deadline, if empty use default
  if (field === "writing-deadline" && val === "") {
    return STATUS_DEFAULTS[field] || "2099-01-01";
  }

  // For priority-today, if empty use default
  if (field === "priority-today" && val === "") {
    return STATUS_DEFAULTS[field] || "0";
  }

  // For city, empty is allowed
  if (field === "city") {
    return val;
  }

  return val;
}

/**
 * Performs surgical migration of a status body.
 * 
 * This function:
 * - Parses the existing body into fields
 * - Maps old field names to new field names
 * - Adds missing new standard fields with defaults
 * - Preserves additional (non-standard) fields
 * - Maintains the new standard field order at the top
 * - Handles conflicts when both old and new names exist
 * 
 * @param body The current status body string
 * @returns The migrated status body string
 */
export function buildMigratedStatusBody(body: string): string {
  // If body is empty, return full standard with defaults
  if (!body || body.trim() === "") {
    const lines: string[] = [];
    for (const field of STATUS_STANDARD_FIELDS) {
      lines.push(`${field}: ${STATUS_DEFAULTS[field]}`);
    }
    return lines.join('\n');
  }

  // Parse existing body into fields and non-field lines
  const existingFields: Map<string, string> = new Map();
  const otherLines: string[] = [];

  const lines = body.split('\n');
  for (const line of lines) {
    const fieldMatch = line.match(/^([\w\s-]+)\s*:\s*(.*)/);
    if (fieldMatch) {
      const fieldName = fieldMatch[1].trim();
      const value = fieldMatch[2].trim();
      existingFields.set(fieldName, value);
    } else if (line.trim() !== '') {
      // Keep non-field lines (comments, etc.)
      otherLines.push(line);
    }
  }

  // Step 1: Apply field name mapping (old -> new)
  const migratedFields: Map<string, string> = new Map();
  const processedOldFields: Set<string> = new Set();

  for (const [oldName, newName] of Object.entries(STATUS_FIELD_ALIASES)) {
    if (existingFields.has(oldName)) {
      processedOldFields.add(oldName);
      
      const oldValue = existingFields.get(oldName) || "";
      
      // Check if new field already exists
      if (existingFields.has(newName)) {
        const newValue = existingFields.get(newName) || "";
        // Priority: new field value if non-empty, otherwise old field value
        if (newValue !== "") {
          migratedFields.set(newName, newValue);
        } else if (oldValue !== "") {
          migratedFields.set(newName, oldValue);
        } else {
          // Both empty, use default
          migratedFields.set(newName, STATUS_DEFAULTS[newName] || "");
        }
      } else {
        // New field doesn't exist, use old field value or default
        if (oldValue !== "") {
          migratedFields.set(newName, oldValue);
        } else {
          migratedFields.set(newName, STATUS_DEFAULTS[newName] || "");
        }
      }
    }
  }

  // Step 2: Copy existing fields that are already in new standard format
  for (const field of STATUS_STANDARD_FIELDS) {
    if (existingFields.has(field) && !migratedFields.has(field)) {
      const value = existingFields.get(field) || "";
      migratedFields.set(field, value);
    }
  }

  // Step 3: Add defaults for missing standard fields
  for (const field of STATUS_STANDARD_FIELDS) {
    if (!migratedFields.has(field)) {
      migratedFields.set(field, STATUS_DEFAULTS[field] || "");
    }
  }

  // Step 4: Collect additional (non-standard) fields to preserve
  const additionalFields: { name: string; value: string }[] = [];
  
  for (const [fieldName, value] of existingFields) {
    // Skip if it's a standard field (already handled)
    if (STATUS_STANDARD_FIELDS.includes(fieldName)) continue;
    
    // Skip if it's an old field name that was mapped
    if (processedOldFields.has(fieldName)) continue;
    
    // Preserve this field
    additionalFields.push({ name: fieldName, value });
  }

  // Step 5: Build the new body
  const resultLines: string[] = [];

  // Add standard fields in order
  for (const field of STATUS_STANDARD_FIELDS) {
    const value = migratedFields.get(field) || "";
    resultLines.push(`${field}: ${value}`);
  }

  // Add additional fields (preserving their original values)
  for (const { name, value } of additionalFields) {
    resultLines.push(`${name}: ${value}`);
  }

  // Add other lines (comments, etc.)
  for (const line of otherLines) {
    resultLines.push(line);
  }

  return resultLines.join('\n');
}