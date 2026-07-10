/**
 * Headers Format Types
 * 
 * Type definitions for the headers format parser.
 * See architecture/headers/headers-format.md for format specification.
 */

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