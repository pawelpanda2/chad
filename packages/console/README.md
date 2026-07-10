# Content Finder

TypeScript client for Content Provider API.

## Usage

### Normal clean run:
```bash
npm run cli
```

Or use the script:
```bash
./03_scripts/01_run_dev.sh
```

### Debug with breakpoints:
VS Code → Run and Debug → Debug cli.ts

> **Note:** During debugging, VS Code may print a long technical command with `NODE_OPTIONS`/`VSCODE_INSPECTOR_OPTIONS`. This output does not come from the application itself.

## Other commands

```bash
npm run typecheck    # Type check only
npm run test:write   # Run write tests
```

## Features

### GetGirlsStatuses - Status Analysis

The application includes a comprehensive status analysis feature accessible via menu option 3 (`GetGirlsStatuses`). This feature:

1. **Classifies all girls into 4 categories:**
   - **Missing status item** - No status item exists
   - **Empty status body** - Status item exists but Body is empty
   - **Outdated status format** - Status uses old format (e.g., `last-verified`, `convo-started`)
   - **Valid status** - Status contains all new required fields

2. **Submenu Option 1** - Creates missing status items:
   - For missing items: Creates new status with POST + initializes with PUT
   - For empty bodies: Updates existing status with PUT
   - Does NOT update outdated formats automatically

3. **Submenu Option 2** - Shows status details by category:
   - Browse statuses by category
   - View individual status content
   - Shows `[empty status body]` for empty statuses

For detailed documentation, see [docs/status-analysis.md](docs/status-analysis.md).
