/**
 * Headers Format Parser
 * 
 * Parses the custom headers format into a structured AST.
 * See architecture/headers/headers-format.md for format specification.
 */

// ============================================================================
// Types
// ============================================================================

/** Line type in the headers format */
export type LineType = 
  | 'header'    // Lines starting with //
  | 'todo'      // Lines starting with t;
  | 'done'      // Lines starting with d;
  | 'note'      // Lines starting with -
  | 'text';     // Regular content lines

/** Parsed node representing a single line */
export interface ParsedNode {
  /** Type of the line */
  type: LineType;
  /** Indentation level (0-based, each tab = 1 level) */
  level: number;
  /** Clean content without markers */
  content: string;
  /** Original raw content with markers */
  rawContent: string;
  /** Header number if present (e.g., "1" from "//1; title") */
  headerNumber?: number;
  /** Original line with full indentation preserved */
  rawLine: string;
}

/** Parsed document structure */
export interface ParsedDocument {
  /** All parsed nodes in order */
  nodes: ParsedNode[];
  /** Maximum indentation level found */
  maxLevel: number;
}

// ============================================================================
// Parser
// ============================================================================

/**
 * Counts the number of leading tab characters in a line.
 * Also handles spaces (4 spaces = 1 tab for compatibility).
 */
function countIndentLevel(line: string): number {
  let tabCount = 0;
  let spaceCount = 0;
  
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\t') {
      tabCount++;
      spaceCount = 0;
    } else if (line[i] === ' ') {
      spaceCount++;
    } else {
      break;
    }
  }
  
  // Convert spaces to tab equivalent (4 spaces = 1 tab)
  const spaceTabs = Math.floor(spaceCount / 4);
  return tabCount + spaceTabs;
}

/**
 * Extracts the content after indentation.
 */
function getTrimmedContent(line: string): string {
  return line.replace(/^[\t ]+/, '');
}

/**
 * Parses a header line and extracts the number if present.
 * Returns { number, content } or null content if not a valid header.
 */
function parseHeader(content: string): { headerNumber?: number; text: string } {
  // Remove the // prefix
  const afterPrefix = content.substring(2);
  
  // Check for number pattern: //1; text or //1;text
  const numberMatch = afterPrefix.match(/^(\d+)\s*;\s*(.*)/);
  
  if (numberMatch) {
    return {
      headerNumber: parseInt(numberMatch[1], 10),
      text: numberMatch[2].trim()
    };
  }
  
  // Check for just semicolon: //; text
  if (afterPrefix.startsWith(';')) {
    return {
      text: afterPrefix.substring(1).trim()
    };
  }
  
  // No number, just text
  return {
    text: afterPrefix.trim()
  };
}

/**
 * Determines the type of a line based on its content.
 */
function detectLineType(content: string): LineType {
  if (content.startsWith('//')) {
    return 'header';
  }
  if (content.startsWith('t;')) {
    return 'todo';
  }
  if (content.startsWith('d;')) {
    return 'done';
  }
  if (content.startsWith('-')) {
    return 'note';
  }
  return 'text';
}

/**
 * Extracts clean content from a line by removing markers.
 */
function extractContent(type: LineType, content: string): string {
  switch (type) {
    case 'header': {
      const parsed = parseHeader(content);
      return parsed.text || content;
    }
    case 'todo':
    case 'done':
      // Remove "t;" or "d;" prefix
      return content.substring(2).trim();
    case 'note':
      // Remove "-" prefix
      return content.substring(1).trim();
    case 'text':
    default:
      return content;
  }
}

/**
 * Parses raw text into a structured document.
 * 
 * @param text - Raw text in headers format
 * @returns Parsed document structure
 */
export function parseHeadersFormat(text: string): ParsedDocument {
  const nodes: ParsedNode[] = [];
  let maxLevel = 0;
  
  // Split by newlines (handle both \n and \r\n)
  const lines = text.split(/\r?\n/);
  
  for (const rawLine of lines) {
    // Skip empty lines
    if (rawLine.trim() === '') {
      continue;
    }
    
    // Count indentation level
    const level = countIndentLevel(rawLine);
    
    // Get content after indentation
    const content = getTrimmedContent(rawLine);
    
    // Detect line type
    const type = detectLineType(content);
    
    // Extract clean content
    const cleanContent = extractContent(type, content);
    
    // Build node
    const node: ParsedNode = {
      type,
      level,
      content: cleanContent,
      rawContent: content,
      rawLine,
    };
    
    // Add header number if applicable
    if (type === 'header') {
      const parsed = parseHeader(content);
      if (parsed.headerNumber !== undefined) {
        node.headerNumber = parsed.headerNumber;
      }
    }
    
    // Track max level
    if (level > maxLevel) {
      maxLevel = level;
    }
    
    nodes.push(node);
  }
  
  return {
    nodes,
    maxLevel,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Gets the badge label for a line type.
 */
export function getBadgeLabel(type: LineType): string | null {
  switch (type) {
    case 'todo': return 't';
    case 'done': return 'd';
    default: return null;
  }
}

/**
 * Gets the color class for a line type.
 */
export function getTypeColorClass(type: LineType): string {
  switch (type) {
    case 'header': return 'text-primary font-semibold';
    case 'todo': return 'text-red-600 dark:text-red-500';
    case 'done': return 'text-green-600 dark:text-green-500';
    case 'note': return 'text-blue-600 dark:text-blue-500';
    case 'text': return 'text-muted-foreground';
    default: return '';
  }
}

/**
 * Checks if a line type has a badge.
 */
export function hasBadge(type: LineType): boolean {
  return type === 'todo' || type === 'done';
}

/**
 * Formats a node for display (with badge if applicable).
 */
export function formatNodeForDisplay(node: ParsedNode): {
  showBadge: boolean;
  badgeLabel: string | null;
  badgeColor: string;
  displayContent: string;
} {
  const showBadge = hasBadge(node.type);
  const badgeLabel = getBadgeLabel(node.type);
  
  let badgeColor = '';
  switch (node.type) {
    case 'todo': badgeColor = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'; break;
    case 'done': badgeColor = 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'; break;
  }
  
  return {
    showBadge,
    badgeLabel,
    badgeColor,
    displayContent: node.content,
  };
}