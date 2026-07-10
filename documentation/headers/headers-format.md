# Headers Format Documentation

## Overview

The Headers Format is a text-based DSL (Domain Specific Language) used for structuring hierarchical content with status tracking and annotations. It is designed to be human-readable while providing rich semantic information for rendering.

This format is used in Msg Planner and other parts of the application for organizing tasks, notes, and content in a structured way.

## Syntax Rules

### 1. Headers (`//`)

Headers define the hierarchical structure of the document. Every line starting with `//` is a header.

```
// Main Section
    // Sub Section
        // Nested Sub Section
```

#### Header Numbering

Headers can include an optional numeric prefix followed by a semicolon for ordering:

```
//1; First Item
//2; Second Item
//3; Third Item
```

The number is part of the header semantics and should be preserved in parsing. It indicates priority or sequence order.

#### Header Levels

The level of a header is determined by its **tab indentation**:

| Tab Count | Level    | Description                    |
|-----------|----------|--------------------------------|
| 0         | Main     | Top-level section              |
| 1         | Sub      | Subsection under main          |
| 2         | Nested   | Subsection under sub           |
| n         | n-level  | Each tab increases depth by 1  |

### 2. Status Markers

Status markers indicate the completion state of an item. They appear at the beginning of a line (after indentation) and are followed by a semicolon.

| Marker | Meaning | Color  | Badge Style |
|--------|---------|--------|-------------|
| `t;`   | TODO    | Red    | Small red badge with "t" |
| `d;`   | DONE    | Green  | Small green badge with "d" |

Examples:
```
t; Task that needs to be done
d; Completed task
    t; Indented TODO item
```

### 3. Notes (`-`)

Lines starting with `-` (after indentation) are notes/annotations. They represent supplementary information.

```
- Important note
- Additional context
    - Nested note
```

**Note markers with numbers** (`-1`, `-2`, `-3`) are reserved for future use. Currently, they should be treated as regular notes.

### 4. Regular Content

Any line that doesn't match the above patterns is treated as regular content/text.

```
03/06/44/02/09; 26-02-07_si_Anna_Kovval
Some descriptive text
Data reference: ABC123
```

## Indentation & Structure

### Tab-Based Hierarchy

The format uses **tab characters** (not spaces) to define hierarchy levels:

```
// Main Header           (Level 0)
    // Sub Header        (Level 1)
        Content line     (Level 2)
        t; Task item     (Level 2)
    // Another Sub       (Level 1)
        d; Done item     (Level 2)
```

### Alignment Rule

**Critical**: All content at the same logical level must start at the exact same horizontal position. The renderer must preserve this alignment - badges and markers should not shift the text position.

Example of correct alignment:
```
t; Daria
03/06/44/02/09; Anna
- important note
```

All three lines above start at the same column position after rendering.

## Color Scheme

| Element        | Color       | Hex Code (suggested) |
|----------------|-------------|----------------------|
| Header         | Dark        | `#1a1a2e` or primary |
| Regular text   | Gray        | `#6b7280`            |
| Note (`-`)     | Blue        | `#3b82f6`            |
| TODO (`t;`)    | Red         | `#ef4444`            |
| DONE (`d;`)    | Green       | `#22c55e`            |

## Parsing Flow

1. **Line Splitting**: Split input by `\n` or `\r\n`
2. **Indentation Detection**: Count leading tab characters
3. **Type Detection**: Determine line type based on patterns:
   - Starts with `//` → Header
   - Starts with `t;` → TODO item
   - Starts with `d;` → DONE item
   - Starts with `-` → Note
   - Otherwise → Regular content
4. **Content Extraction**: Remove markers and extract clean content
5. **Structure Building**: Build tree based on indentation levels

## Edge Cases

### 1. Empty Lines
Empty lines (only whitespace) should be skipped during parsing.

### 2. Mixed Indentation
If spaces are used instead of tabs, treat each sequence of spaces as equivalent to tabs for compatibility, but prefer tabs.

### 3. Multiple Markers
A line should only have one primary marker. If both `t;` and `-` appear, the first one takes precedence.

### 4. Headers with Status
Headers can technically have status markers, but this is unusual:
```
//1; t; Header with TODO
```
Treat the entire content after `//` as header content.

### 5. Special Characters in Content
Content may contain semicolons, dashes, and slashes that are not markers:
```
03/06/44/02/09; 26-02-07_si_Anna_Kovval
```
The semicolon here is part of the data, not a status marker, because the line doesn't start with `t;` or `d;`.

## Future Extensions

### Potential New Status Markers
- `p;` - In Progress
- `w;` - Waiting/Blocked
- `x;` - Cancelled

### Potential New Features
- Inline comments (`# comment`)
- Links/references (`[[reference]]`)
- Tags (`@tag`)
- Priority indicators beyond numbering

## Example Document

```
//sorted
    //1; obowiązkowo nowe
        t; Daria
        d; Aga
        03/06/44/02/09; 26-02-07_si_Anna_Kovval
        - ważne kontynuacje
    //2; ważne
        t; Kasia
        - sprawdzić status
    //3; wypadałoby
        d; Marta
        zwykły tekst
```

## Parser Architecture

The parser should be separated from the renderer:

```
Input Text
    ↓
[HeadersParser] → Parsed Structure (AST)
    ↓
[HeadersRenderer] → React Components / HTML
```

### Parsed Structure (AST)

```typescript
interface ParsedNode {
  type: 'header' | 'todo' | 'done' | 'note' | 'text';
  level: number;           // Indentation level (0-based)
  content: string;         // Clean content without markers
  rawContent: string;      // Original content with markers
  headerNumber?: number;   // For headers with numbering
}
```

## Implementation Guidelines for AI

When implementing or modifying the Headers Format parser/renderer:

1. **Always separate parsing from rendering** - The parser should produce a clean AST
2. **Preserve indentation exactly** - Do not add extra spacing that shifts content
3. **Use consistent colors** - Reference the color scheme above
4. **Handle edge cases gracefully** - Don't crash on malformed input
5. **Document new markers** - If adding new status markers, update this documentation