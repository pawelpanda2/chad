/**
 * CP Flow - Content Provider Operations Layer
 * 
 * This is the ONLY place where Content Provider args are manually constructed.
 * All routes (folders, forms) must use these methods, not construct args directly.
 */

import * as yaml from 'js-yaml';

// Shared repository GUID - same as used by Leads and other working features
const SHARED_REPO_ID = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

// Content Provider API URL (for debug/logging purposes)
const CP_API_URL = process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055';

// Types for debug trace
export interface CpCallTrace {
  step: string;
  args: string[];
  rawRequest: Record<string, unknown>;
  rawResponse: string;
  parsedResponse: Record<string, unknown> | null;
  parseError: string | null;
  error: string | null;
}

export interface RepoKeyResult {
  repoKey: string;
  repoKeySource: string;
  sessionUserGuid: string | null;
  sessionUsername: string | null;
}

export interface FormsResult {
  actionRecords: Array<{ recordKey: string; body?: Record<string, unknown> }>;
  leadRecords: Array<{ recordKey: string; body?: Record<string, unknown> }>;
  cpCalls: CpCallTrace[];
  error?: string;
}

export interface SaveFormResult {
  success: boolean;
  cpCalls: CpCallTrace[];
  error?: string;
}

export interface DateEntryRecord {
  itemName: string;
  body?: Record<string, unknown>;
}

export interface DailyEntryRecord {
  itemName: string;
  body?: Record<string, unknown>;
}

/**
 * Invoke Content Provider API and return raw response
 */
async function invokeCp(args: string[]): Promise<{ success: boolean; result?: string; error?: { message?: string } }> {
  const response = await fetch(`${CP_API_URL}/invoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });

  // Get response text first to handle both JSON and non-JSON responses
  const responseText = await response.text();

  // Try to parse as JSON
  try {
    const json = JSON.parse(responseText);
    return json;
  } catch {
    // If parsing fails, check if it's an error message
    if (!response.ok || responseText.includes('error')) {
      throw new Error(`CP Error: ${responseText}`);
    }
    // Return as result if it's a plain string
    return { success: true, result: responseText };
  }
}

/**
 * Parse YAML string to object
 */
function parseYaml(str: string): Record<string, unknown> | null {
  try {
    const result = yaml.load(str);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Parse JSON string to object (for PostParentItem responses)
 */
function parseJson(str: string): Record<string, unknown> | null {
  try {
    const result = JSON.parse(str);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return result as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Extract loca from PostParentItem JSON response
 * Response format: { adrTuple: { repo: string, loca: string }, ... }
 */
function extractLocaFromJson(jsonStr: string): string | null {
  const parsed = parseJson(jsonStr);
  if (parsed) {
    const adrTuple = parsed.adrTuple as Record<string, string> | undefined;
    if (adrTuple && adrTuple.loca) {
      return adrTuple.loca;
    }
    // Also check address field
    if (parsed.address as string) {
      return parsed.address as string;
    }
  }
  return null;
}

/**
 * Invoke CP and create a trace entry
 */
async function invokeCpWithTrace(
  traces: CpCallTrace[],
  step: string,
  args: string[]
): Promise<string | null> {
  const trace: CpCallTrace = {
    step,
    args,
    rawRequest: {},
    rawResponse: '',
    parsedResponse: null,
    parseError: null,
    error: null,
  };

  try {
    const result = await invokeCp(args);
    trace.rawResponse = result.result || '';
    
    if (result.result) {
      trace.parsedResponse = parseYaml(result.result);
    }

    if (!result.success) {
      trace.error = result.error?.message || 'Unknown CP error';
    }

    traces.push(trace);
    return result.result || null;
  } catch (e) {
    trace.error = e instanceof Error ? e.message : String(e);
    traces.push(trace);
    return null;
  }
}

/**
 * Resolve repo key from session
 * Returns the repo key to use for Content Provider operations
 * 
 * The repo key must be a valid identifier without hyphens.
 * If username is a GUID (contains hyphens), we remove the hyphens.
 */
export async function resolveRepoKey(session: { user?: { id?: string; username?: string } } | null): Promise<RepoKeyResult> {
  const sessionUserGuid = session?.user?.id || null;
  const sessionUsername = session?.user?.username || null;

  // Use username as repo key, but remove hyphens if it's a GUID
  // GUID format: 339e1f74-ec6e-46ef-835b-fea92e66a491 -> 339e1f74ec6e46ef835bfea92e66a491
  let repoKey = sessionUsername || '';
  let repoKeySource = sessionUsername ? 'session.username' : 'none';
  
  // Remove hyphens from GUID-like strings
  if (repoKey && repoKey.includes('-')) {
    repoKey = repoKey.replace(/-/g, '');
    repoKeySource = 'session.username (GUID hyphens removed)';
  }

  return {
    repoKey,
    repoKeySource,
    sessionUserGuid,
    sessionUsername,
  };
}

/**
 * Get all action records for a user
 * Flow:
 * 1. GetByNames(repoKey, "forms", "actions") - get list of records
 * 2. For each record: GetByNames(repoKey, "forms", "actions", recordKey) - get body
 */
export async function getUserActionRecords(repoKey: string): Promise<{ records: Array<{ recordKey: string; body?: Record<string, unknown> }>; cpCalls: CpCallTrace[] }> {
  const cpCalls: CpCallTrace[] = [];

  // Step 1: Get actions folder
  const actionsResult = await invokeCpWithTrace(
    cpCalls,
    'Get actions folder',
    ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'forms', 'actions']
  );

  const records: Array<{ recordKey: string; body?: Record<string, unknown> }> = [];

  if (actionsResult) {
    const parsed = parseYaml(actionsResult);
    const items = parsed?.items as Array<{ name?: string }> | undefined;
    
    if (items) {
      // Step 2: Get each record body
      for (const item of items) {
        const recordKey = item.name;
        if (recordKey) {
          const recordResult = await invokeCpWithTrace(
            cpCalls,
            `Get action record: ${recordKey}`,
            ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'forms', 'actions', recordKey]
          );

          records.push({
            recordKey,
            body: recordResult ? parseYaml(recordResult) || undefined : undefined,
          });
        }
      }
    }
  }

  return { records, cpCalls };
}

/**
 * Get all lead records for a user
 * Flow:
 * 1. GetByNames(repoKey, "forms", "leads") - get list of records
 * 2. For each record: GetByNames(repoKey, "forms", "leads", recordKey) - get body
 */
export async function getUserLeadRecords(repoKey: string): Promise<{ records: Array<{ recordKey: string; body?: Record<string, unknown> }>; cpCalls: CpCallTrace[] }> {
  const cpCalls: CpCallTrace[] = [];

  // Step 1: Get leads folder
  const leadsResult = await invokeCpWithTrace(
    cpCalls,
    'Get leads folder',
    ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'forms', 'leads']
  );

  const records: Array<{ recordKey: string; body?: Record<string, unknown> }> = [];

  if (leadsResult) {
    const parsed = parseYaml(leadsResult);
    const items = parsed?.items as Array<{ name?: string }> | undefined;
    
    if (items) {
      // Step 2: Get each record body
      for (const item of items) {
        const recordKey = item.name;
        if (recordKey) {
          const recordResult = await invokeCpWithTrace(
            cpCalls,
            `Get lead record: ${recordKey}`,
            ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'forms', 'leads', recordKey]
          );

          records.push({
            recordKey,
            body: recordResult ? parseYaml(recordResult) || undefined : undefined,
          });
        }
      }
    }
  }

  return { records, cpCalls };
}

/**
 * Get all forms for current user
 */
export async function getCurrentUserForms(session: { user?: { id?: string; username?: string } } | null): Promise<FormsResult> {
  const repoInfo = await resolveRepoKey(session);
  
  if (!repoInfo.repoKey) {
    return {
      actionRecords: [],
      leadRecords: [],
      cpCalls: [],
      error: 'No repo key available',
    };
  }

  const allCalls: CpCallTrace[] = [];
  const actionResult = await getUserActionRecords(repoInfo.repoKey);
  const leadResult = await getUserLeadRecords(repoInfo.repoKey);

  allCalls.push(...actionResult.cpCalls);
  allCalls.push(...leadResult.cpCalls);

  return {
    actionRecords: actionResult.records,
    leadRecords: leadResult.records,
    cpCalls: allCalls,
  };
}

/**
 * Save action form to Content Provider
 * Flow:
 * 1. PostByNames(repoKey, "Text", "forms", "actions", recordKey)
 * 2. GetByNames(repoKey, "forms", "actions", recordKey) - get item address
 * 3. Put(repoKey, itemAddress, "Text", recordKey, body)
 */
export async function saveActionForm(
  session: { user?: { id?: string; username?: string } } | null,
  payload: Record<string, unknown>
): Promise<SaveFormResult> {
  const repoInfo = await resolveRepoKey(session);
  
  if (!repoInfo.repoKey) {
    return {
      success: false,
      cpCalls: [],
      error: 'No repo key available',
    };
  }

  const cpCalls: CpCallTrace[] = [];
  const recordKey = payload.recordKey as string || new Date().toISOString();

  try {
    // Step 1: PostByNames to ensure path exists
    await invokeCpWithTrace(
      cpCalls,
      'PostByNames action record',
      ['IRepoService', 'IItemWorker', 'PostByNames', repoInfo.repoKey, 'Text', 'forms', 'actions', recordKey]
    );

    // Step 2: GetByNames to get item address
    const getResult = await invokeCpWithTrace(
      cpCalls,
      'Get action record after PostByNames',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoInfo.repoKey, 'forms', 'actions', recordKey]
    );

    // Step 3: Put body
    const bodyYaml = yaml.dump(payload);
    
    const itemAddress = getResult ? parseYaml(getResult)?.address as string : '';
    
    if (itemAddress) {
      await invokeCpWithTrace(
        cpCalls,
        'Put action body',
        ['IRepoService', 'IItemWorker', 'Put', repoInfo.repoKey, itemAddress, 'Text', recordKey, bodyYaml]
      );
    }

    return { success: true, cpCalls };
  } catch (e) {
    return {
      success: false,
      cpCalls,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Save lead form to Content Provider
 * Flow:
 * 1. PostByNames(repoKey, "Text", "forms", "leads", recordKey)
 * 2. GetByNames(repoKey, "forms", "leads", recordKey) - get item address
 * 3. Put(repoKey, itemAddress, "Text", recordKey, body)
 */
export async function saveLeadForm(
  session: { user?: { id?: string; username?: string } } | null,
  payload: Record<string, unknown>
): Promise<SaveFormResult> {
  const repoInfo = await resolveRepoKey(session);
  
  if (!repoInfo.repoKey) {
    return {
      success: false,
      cpCalls: [],
      error: 'No repo key available',
    };
  }

  const cpCalls: CpCallTrace[] = [];
  const recordKey = payload.recordKey as string || new Date().toISOString();

  try {
    // Step 1: PostByNames to ensure path exists
    await invokeCpWithTrace(
      cpCalls,
      'PostByNames lead record',
      ['IRepoService', 'IItemWorker', 'PostByNames', repoInfo.repoKey, 'Text', 'forms', 'leads', recordKey]
    );

    // Step 2: GetByNames to get item address
    const getResult = await invokeCpWithTrace(
      cpCalls,
      'Get lead record after PostByNames',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoInfo.repoKey, 'forms', 'leads', recordKey]
    );

    // Step 3: Put body
    const bodyYaml = yaml.dump(payload);
    
    const itemAddress = getResult ? parseYaml(getResult)?.address as string : '';
    
    if (itemAddress) {
      await invokeCpWithTrace(
        cpCalls,
        'Put lead body',
        ['IRepoService', 'IItemWorker', 'Put', repoInfo.repoKey, itemAddress, 'Text', recordKey, bodyYaml]
      );
    }

    return { success: true, cpCalls };
  } catch (e) {
    return {
      success: false,
      cpCalls,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Get all date entry records for a user
 * Flow:
 * 1. GetByNames(repoKey, "actions", "dates") - get list of records
 * 2. For each record: GetByNames(repoKey, "actions", "dates", itemName) - get body
 */
export async function getDateEntryRecords(repoKey: string): Promise<{ records: DateEntryRecord[]; cpCalls: CpCallTrace[] }> {
  const cpCalls: CpCallTrace[] = [];

  // Step 1: Get dates folder
  const datesResult = await invokeCpWithTrace(
    cpCalls,
    'Get actions/dates folder',
    ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'actions', 'dates']
  );

  const records: DateEntryRecord[] = [];

  if (datesResult) {
    const parsed = parseYaml(datesResult);
    const items = parsed?.items as Array<{ name?: string }> | undefined;
    
    if (items) {
      // Step 2: Get each record body
      for (const item of items) {
        const itemName = item.name;
        if (itemName) {
          const recordResult = await invokeCpWithTrace(
            cpCalls,
            `Get date entry: ${itemName}`,
            ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'actions', 'dates', itemName]
          );

          records.push({
            itemName,
            body: recordResult ? parseYaml(recordResult) || undefined : undefined,
          });
        }
      }
    }
  }

  return { records, cpCalls };
}

/**
 * Get all daily entry records for a user
 * Flow:
 * 1. GetByNames(repoKey, "actions", "daily") - get list of records
 * 2. For each record: GetByNames(repoKey, "actions", "daily", itemName) - get body
 */
export async function getDailyEntryRecords(repoKey: string): Promise<{ records: DailyEntryRecord[]; cpCalls: CpCallTrace[] }> {
  const cpCalls: CpCallTrace[] = [];

  // Step 1: Get daily folder
  const dailyResult = await invokeCpWithTrace(
    cpCalls,
    'Get actions/daily folder',
    ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'actions', 'daily']
  );

  const records: DailyEntryRecord[] = [];

  if (dailyResult) {
    const parsed = parseYaml(dailyResult);
    const items = parsed?.items as Array<{ name?: string }> | undefined;
    
    if (items) {
      // Step 2: Get each record body
      for (const item of items) {
        const itemName = item.name;
        if (itemName) {
          const recordResult = await invokeCpWithTrace(
            cpCalls,
            `Get daily entry: ${itemName}`,
            ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, 'actions', 'daily', itemName]
          );

          records.push({
            itemName,
            body: recordResult ? parseYaml(recordResult) || undefined : undefined,
          });
        }
      }
    }
  }

  return { records, cpCalls };
}

/**
 * Save date entry form to Content Provider
 * Flow:
 * 1. Ensure folder "actions" exists under root (using PostParentItem or GetByNames)
 * 2. Ensure folder "dates" exists under actions
 * 3. PostParentItem(SHARED_REPO_ID, datesLoca, "Text", itemName) - create text item
 * 4. GetByNames(SHARED_REPO_ID, "actions", "dates", itemName) - get item address
 * 5. Put(SHARED_REPO_ID, itemLoca, bodyYaml)
 */
export async function saveDateEntryForm(
  session: { user?: { id?: string; username?: string } } | null,
  itemName: string,
  payload: Record<string, unknown>
): Promise<SaveFormResult> {
  // Use SHARED_REPO_ID - same repo as Leads and other working features
  const repoGuid = SHARED_REPO_ID;
  
  // Session is not used for repo identification, but we keep it for future use
  const _sessionUserGuid = session?.user?.id || null;

  const cpCalls: CpCallTrace[] = [];

  try {
    // Step 1: Ensure "actions" folder exists under root
    // First try to get it
    let actionsLoca = '';
    const actionsResult = await invokeCpWithTrace(
      cpCalls,
      'Get actions folder',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoGuid, 'actions']
    );
    
    if (actionsResult) {
      const parsed = parseYaml(actionsResult);
      actionsLoca = (parsed?.address as string) || '';
    }
    
    // If not found, create it
    if (!actionsLoca) {
      const createActionsResult = await invokeCpWithTrace(
        cpCalls,
        'Create actions folder',
        ['IRepoService', 'IItemWorker', 'PostParentItem', repoGuid, '', 'Folder', 'actions']
      );
      if (createActionsResult) {
        // PostParentItem returns JSON, not YAML
        actionsLoca = extractLocaFromJson(createActionsResult) || '';
      }
    }

    if (!actionsLoca) {
      return {
        success: false,
        cpCalls,
        error: 'Failed to get or create actions folder',
      };
    }

    // Step 2: Ensure "dates" folder exists under actions
    let datesLoca = '';
    const datesResult = await invokeCpWithTrace(
      cpCalls,
      'Get dates folder',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoGuid, 'actions', 'dates']
    );
    
    if (datesResult) {
      const parsed = parseYaml(datesResult);
      datesLoca = (parsed?.address as string) || '';
    }
    
    // If not found, create it
    if (!datesLoca) {
      const createDatesResult = await invokeCpWithTrace(
        cpCalls,
        'Create dates folder',
        ['IRepoService', 'IItemWorker', 'PostParentItem', repoGuid, actionsLoca, 'Folder', 'dates']
      );
      if (createDatesResult) {
        // PostParentItem returns JSON, not YAML
        datesLoca = extractLocaFromJson(createDatesResult) || '';
      }
    }

    if (!datesLoca) {
      return {
        success: false,
        cpCalls,
        error: 'Failed to get or create dates folder',
      };
    }

    // Step 3: Create text item under dates folder
    await invokeCpWithTrace(
      cpCalls,
      'PostParentItem date entry text item',
      ['IRepoService', 'IItemWorker', 'PostParentItem', repoGuid, datesLoca, 'Text', itemName]
    );

    // Step 4: Get item address
    const getResult = await invokeCpWithTrace(
      cpCalls,
      'Get date entry item after PostParentItem',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoGuid, 'actions', 'dates', itemName]
    );

    // Step 5: Put body
    const bodyYaml = yaml.dump(payload);
    const itemLoca = getResult ? parseYaml(getResult)?.address as string : '';
    
    if (itemLoca) {
      await invokeCpWithTrace(
        cpCalls,
        'Put date entry body',
        ['IRepoService', 'IItemWorker', 'Put', repoGuid, itemLoca, bodyYaml]
      );
    }

    return { success: true, cpCalls };
  } catch (e) {
    return {
      success: false,
      cpCalls,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Save daily entry form to Content Provider
 * Flow:
 * 1. Ensure folder "actions" exists under root (using PostParentItem or GetByNames)
 * 2. Ensure folder "daily" exists under actions
 * 3. PostParentItem(repoKey, dailyLoca, "Text", itemName) - create text item
 * 4. GetByNames(repoKey, "actions", "daily", itemName) - get item address
 * 5. Put(repoKey, itemLoca, bodyYaml)
 */
export async function saveDailyEntryForm(
  session: { user?: { id?: string; username?: string } } | null,
  itemName: string,
  payload: Record<string, unknown>
): Promise<SaveFormResult> {
  const repoInfo = await resolveRepoKey(session);
  
  if (!repoInfo.repoKey) {
    return {
      success: false,
      cpCalls: [],
      error: 'No repo key available',
    };
  }

  const cpCalls: CpCallTrace[] = [];

  try {
    // Step 1: Ensure "actions" folder exists under root
    let actionsLoca = '';
    const actionsResult = await invokeCpWithTrace(
      cpCalls,
      'Get actions folder',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoInfo.repoKey, 'actions']
    );
    
    if (actionsResult) {
      const parsed = parseYaml(actionsResult);
      actionsLoca = (parsed?.address as string) || '';
    }
    
    // If not found, create it
    if (!actionsLoca) {
      const createActionsResult = await invokeCpWithTrace(
        cpCalls,
        'Create actions folder',
        ['IRepoService', 'IItemWorker', 'PostParentItem', repoInfo.repoKey, '', 'Folder', 'actions']
      );
      if (createActionsResult) {
        // PostParentItem returns JSON, not YAML
        actionsLoca = extractLocaFromJson(createActionsResult) || '';
      }
    }

    if (!actionsLoca) {
      return {
        success: false,
        cpCalls,
        error: 'Failed to get or create actions folder',
      };
    }

    // Step 2: Ensure "daily" folder exists under actions
    let dailyLoca = '';
    const dailyResult = await invokeCpWithTrace(
      cpCalls,
      'Get daily folder',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoInfo.repoKey, 'actions', 'daily']
    );
    
    if (dailyResult) {
      const parsed = parseYaml(dailyResult);
      dailyLoca = (parsed?.address as string) || '';
    }
    
    // If not found, create it
    if (!dailyLoca) {
      const createDailyResult = await invokeCpWithTrace(
        cpCalls,
        'Create daily folder',
        ['IRepoService', 'IItemWorker', 'PostParentItem', repoInfo.repoKey, actionsLoca, 'Folder', 'daily']
      );
      if (createDailyResult) {
        // PostParentItem returns JSON, not YAML
        dailyLoca = extractLocaFromJson(createDailyResult) || '';
      }
    }

    if (!dailyLoca) {
      return {
        success: false,
        cpCalls,
        error: 'Failed to get or create daily folder',
      };
    }

    // Step 3: Create text item under daily folder
    await invokeCpWithTrace(
      cpCalls,
      'PostParentItem daily entry text item',
      ['IRepoService', 'IItemWorker', 'PostParentItem', repoInfo.repoKey, dailyLoca, 'Text', itemName]
    );

    // Step 4: Get item address
    const getResult = await invokeCpWithTrace(
      cpCalls,
      'Get daily entry item after PostParentItem',
      ['IRepoService', 'IItemWorker', 'GetByNames', repoInfo.repoKey, 'actions', 'daily', itemName]
    );

    // Step 5: Put body
    const bodyYaml = yaml.dump(payload);
    const itemLoca = getResult ? parseYaml(getResult)?.address as string : '';
    
    if (itemLoca) {
      await invokeCpWithTrace(
        cpCalls,
        'Put daily entry body',
        ['IRepoService', 'IItemWorker', 'Put', repoInfo.repoKey, itemLoca, bodyYaml]
      );
    }

    return { success: true, cpCalls };
  } catch (e) {
    return {
      success: false,
      cpCalls,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}

/**
 * Generate unique item name based on date with suffix handling
 * Returns: YY-MM-DD, YY-MM-DDb, YY-MM-DDc, etc.
 */
export async function generateDateItemName(
  repoKey: string,
  folderPath: string[], // e.g., ['actions', 'dates'] or ['actions', 'daily']
  dateStr: string // YYYY-MM-DD format
): Promise<{ itemName: string; cpCalls: CpCallTrace[] }> {
  const cpCalls: CpCallTrace[] = [];

  // Convert YYYY-MM-DD to YY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) {
    return { itemName: dateStr, cpCalls };
  }
  const shortDate = `${parts[0].slice(-2)}-${parts[1]}-${parts[2]}`;

  // Check if folder exists and get existing items
  const folderResult = await invokeCpWithTrace(
    cpCalls,
    `Get folder: ${folderPath.join('/')}`,
    ['IRepoService', 'IItemWorker', 'GetByNames', repoKey, ...folderPath]
  );

  const existingNames: string[] = [];
  if (folderResult) {
    const parsed = parseYaml(folderResult);
    const items = parsed?.items as Array<{ name?: string }> | undefined;
    if (items) {
      for (const item of items) {
        if (item.name) {
          existingNames.push(item.name);
        }
      }
    }
  }

  // Check if base name exists
  if (!existingNames.includes(shortDate)) {
    return { itemName: shortDate, cpCalls };
  }

  // Find highest suffix
  const suffixPattern = new RegExp(`^${shortDate}([b-z])$`);
  let maxSuffix = 0; // 0 = no suffix, 1 = b, 2 = c, etc.

  for (const name of existingNames) {
    const match = name.match(suffixPattern);
    if (match) {
      const suffixChar = match[1];
      const suffixIndex = suffixChar.charCodeAt(0) - 'b'.charCodeAt(0) + 1;
      if (suffixIndex > maxSuffix) {
        maxSuffix = suffixIndex;
      }
    }
  }

  // Generate next suffix
  const nextSuffix = maxSuffix + 1;
  const suffixChar = String.fromCharCode('b'.charCodeAt(0) + nextSuffix - 1);
  
  return { itemName: `${shortDate}${suffixChar}`, cpCalls };
}
