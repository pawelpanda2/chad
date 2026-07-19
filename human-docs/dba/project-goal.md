# Project Goal - chad-dba & Beeper Integration

## Overview

This project connects Beeper/WhatsApp data with Content Provider, helping to match leads from Beeper exports with leads stored in Content Provider, detect contacts saved in CP items, and eventually enable data synchronization.

## Primary Goals

### 1. Data Integration
- Connect Beeper/WhatsApp conversation exports with Content Provider storage
- Match leads from Beeper exports (`AA_output`) with leads stored in CP (`leads/all-items`)
- Detect and parse contact information stored in CP items (YAML format)

### 2. Intelligent Matching
- Find which Beeper leads correspond to which CP leads
- Identify leads that have contact information vs those that don't
- Provide tools for intelligent lead matching and discovery

### 3. Data Access Layer
- Provide unified API access to Content Provider through `chad-dba`
- **Important**: Python scripts should NOT duplicate CP access logic
- All CP operations must go through `chad-dba` TypeScript methods

## Current Phase: Discovery & Matching

### What We're Building Now

1. **Lead Discovery** (`PrintAllLeads`)
   - Fetch all leads from Content Provider
   - Display them in a readable, numbered list
   - Show basic metadata (name, location, etc.)

2. **Contact Finding** (`FindContacts`)
   - For each lead, attempt to fetch the `contacts` item
   - Parse YAML content from contacts
   - Separate leads into:
     - **Matched**: leads with contacts
     - **Unmatched**: leads without contacts

### Architecture Principle

```
┌─────────────────┐    ┌──────────────┐    ┌──────────────────┐
│  Python Script  │───▶│   chad-dba   │───▶│ Content Provider │
│   (CLI/Menu)    │    │ (TypeScript) │    │      API         │
└─────────────────┘    └──────────────┘    └──────────────────┘
```

**Key Rule**: Python is just a wrapper/CLI. All real CP logic lives in `chad-dba`.

## Future Phases

### Phase 2: Writing & Synchronization
- Create/update lead items in CP
- Save Beeper conversation content to CP
- Synchronize contact information

### Phase 3: Advanced Matching
- Intelligent matching algorithms
- Fuzzy name matching
- Contact-based lead linking

## Technical Approach

### chad-dba Methods (TypeScript)

Core methods for lead access:
- `GetAllLeads()` - Get all leads from `leads/all-items`
- `GetLeadByName(name)` - Get specific lead
- `getLeadContacts(name)` - Get contacts YAML for a lead
- `getAllLeadsWithContacts()` - Get leads with contact status
- `getAllLeadNames()` - Get just the names

### Python Script Structure

```python
# Separate concerns
load_cp_leads()           # Fetch from chad-dba
load_lead_contacts()      # Get contacts for each lead
parse_contacts_yaml()     # Parse YAML content
split_matched_unmatched() # Categorize leads
```

## Data Structure

### Content Provider Paths

```
leads/
  all-items/
    [lead_name_1]/
      contacts        # YAML file with contact links
      status          # Status information
    [lead_name_2]/
      contacts
      status
```

### Contacts YAML Format

```yaml
facebook:
  - https://www.facebook.com/aleksandra.karpiuk.714
  - https://www.facebook.com/messages/e2ee/t/9867519229946152
instagram:
  - https://instagram.com/profile
```

## Key Decisions

1. **No Logic Duplication**: Python doesn't implement CP access logic
2. **Use Existing Methods**: Leverage existing `chad-dba` functions
3. **Incremental Development**: Start with discovery, then add writing
4. **Clear Separation**: CLI logic in Python, data access in TypeScript

## Repository Information

- **Shared Repository ID**: `21d11bdc-f1f4-44d1-b61a-3fa6b039c641`
- **User**: `pawel_f`
- **Primary Paths**: `leads/all items`, `beeper/whatsup`

## Roles

### python_beeper
- CLI wrapper for user interaction
- Provides menu-driven interface
- Displays results in human-readable format
- Does NOT implement CP access logic

### chad-dba
- All Content Provider API access logic
- TypeScript/Node.js module
- Provides helper methods like `getAllLeadNames()`, `getLeadContacts()`, etc.
- Single source of truth for CP operations

### Content Provider
- Backend storage system
- Stores leads, contacts, reports, beeper data
- Accessed via API through chad-dba

## Future Lead Matching

The ultimate goal is to match leads from Beeper exports with leads in Content Provider:
1. Load Beeper leads from `AA_output`
2. Load CP leads from `leads/all items`
3. Match by name, contacts, or other criteria
4. Identify missing leads in either system
