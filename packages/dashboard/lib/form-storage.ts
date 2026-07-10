/**
 * Form Storage Service - Zapis formularzy przez Content Provider API
 *
 * Ten serwis obsługuje zapis formularzy (action, lead) w strukturze Content Provider
 * zgodnie z pattern:
 *
 *   getByNames(userGuid, ["forms"], [formName], [recordKey])
 *
 * Gdzie:
 *   - userGuid: GUID użytkownika (służy jako repo ID)
 *   - forms: stała nazwa logiczna dla folderu formularzy
 *   - formName: nazwa formularza (np. "action", "lead")
 *   - recordKey: timestamp w formacie YYMMDD_HHMMSS
 *
 * Struktura fizyczna w cp-root:
 *
 *   cp-root/repos/<userGuid>/
 *     01/ (name: "forms")
 *       01/ (name: <formName>)
 *         01/ (name: <recordKey>)
 *           config.yaml
 *           body.txt (lub body.yaml)
 *
 * Każdy formularz tworzy nowy rekord - nie nadpisujemy istniejących.
 */

import * as yaml from 'js-yaml';

// Content Provider API URL (for debug/logging purposes)
const CONTENT_PROVIDER_API_URL = process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055';

/**
 * Response from Sharp runner when creating/updating nodes
 */
interface SharpRunnerResponse {
  success: boolean;
  result?: string;
  error?: { message?: string };
}

/**
 * Form record data structure for action form
 */
export interface ActionFormRecord {
  formName: 'action';
  userGuid: string;
  createdAt: string;
  recordKey: string;
  actionTitle: string;
  actionDate: string;
  actionType: 'dg' | 'ng';
  actionTypeLabel: 'daygame' | 'nightgame';
  optionalTitleSuffix?: string;
  actionStartTime: string;
  actionStartDateTime?: string;
  notes?: string;
}

/**
 * Form record data structure for lead form
 */
export interface LeadFormRecord {
  formName: 'lead';
  userGuid: string;
  createdAt: string;
  recordKey: string;
  name: string;
  age?: number;
  source: string;
  phone?: string;
  instagram?: string;
  facebook?: string;
  whatsappName?: string;
  shortDescription?: string;
  status: string;
  notes?: string;
  outingId?: number;
}

export type FormRecord = ActionFormRecord | LeadFormRecord;

/**
 * Generate record key in YYMMDD_HHMMSS format
 */
export function generateRecordKey(date?: Date): string {
  const d = date || new Date();
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  const seconds = d.getSeconds().toString().padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Generate action title in format: YY-MM-DD_<dg|ng>[_suffix]
 */
export function generateActionTitle(
  date: Date,
  actionType: 'dg' | 'ng',
  suffix?: string
): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  let title = `${year}-${month}-${day}_${actionType}`;
  if (suffix && suffix.trim()) {
    title += `_${suffix.trim()}`;
  }
  
  return title;
}

/**
 * Generate action date in format: YY-MM-DD
 */
export function generateActionDate(date: Date): string {
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Invoke Content Provider API
 */
async function invokeContentProvider(args: string[]): Promise<SharpRunnerResponse> {
  const apiUrl = CONTENT_PROVIDER_API_URL;
  const invokeUrl = `${apiUrl}/invoke`;

  console.log('[FormStorage] Calling Content Provider API:', args.join(' '));

  try {
    const response = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // The backend returns { Body, Settings } directly, not { success, result }
    // Check if the response has the expected structure
    if (data.Body !== undefined || data.Settings !== undefined) {
      return {
        success: true,
        result: JSON.stringify(data),
      };
    }

    // If it has success/result format, use that
    if (data.success !== undefined) {
      if (!data.success) {
        const errorMsg = data.error?.message || 'Unknown error from Content Provider API';
        throw new Error(`Content Provider API error: ${errorMsg}`);
      }
      return {
        success: true,
        result: data.result || '',
      };
    }

    // Unknown format
    throw new Error('Unknown response format from Content Provider API');
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FormStorage] API call failed:', errorMessage);
    throw new Error(`[FormStorage] Failed to call Content Provider API: ${errorMessage}`);
  }
}

/**
 * Ensure repository exists for user (creates if not exists)
 * Uses userGuid as the repository ID
 */
async function ensureUserRepo(userGuid: string): Promise<boolean> {
  // First check if repo exists by trying to list repos
  try {
    const result = await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'GetByNames',
      'root',
      'repos'
    ]);
    
    // Parse result to check if user repo exists
    if (result.result) {
      const parsed = yaml.load(result.result) as Record<string, unknown>;
      const repos = parsed.repos as Array<{ id?: string }> | undefined;
      if (repos && repos.some(r => r.id === userGuid)) {
        console.log('[FormStorage] User repo already exists:', userGuid);
        return true;
      }
    }
  } catch {
    // Ignore errors, we'll try to create
  }

  // Create repo for user
  const now = new Date().toISOString();
  const repoConfigYaml = yaml.dump({
    id: userGuid,
    name: `User ${userGuid.slice(0, 8)}`,
    type: 'Folder',
    createdAt: now,
    updatedAt: now,
  });

  try {
    await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'CreateItem',
      'root',
      'repos',
      userGuid,
      repoConfigYaml
    ]);
    console.log('[FormStorage] Created user repo:', userGuid);
    return true;
  } catch (error) {
    console.error('[FormStorage] Failed to create user repo:', error);
    return false;
  }
}

/**
 * Ensure forms folder exists in user repo
 * Creates: repos/<userGuid>/forms/ (logical name: "forms")
 * 
 * Uses logical name "forms" - Content Provider will find/create the correct physical folder.
 */
async function ensureFormsFolder(userGuid: string): Promise<boolean> {
  const now = new Date().toISOString();
  const folderConfigYaml = yaml.dump({
    id: crypto.randomUUID ? crypto.randomUUID() : generateSimpleGuid(),
    type: 'Folder',
    name: 'forms',
    createdAt: now,
    updatedAt: now,
  });

  try {
    // Use logical name "forms" instead of physical "01"
    await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'CreateItem',
      'root',
      'repos',
      userGuid,
      'forms',
      folderConfigYaml
    ]);
    console.log('[FormStorage] Created forms folder in repo:', userGuid);
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('already exists')) {
      console.log('[FormStorage] Forms folder already exists in repo:', userGuid);
      return true;
    }
    console.error('[FormStorage] Failed to create forms folder:', error);
    return false;
  }
}

/**
 * Ensure form type folder exists (e.g., "action" or "lead")
 * Creates: repos/<userGuid>/forms/<formName>/ (logical name: <formName>)
 * 
 * Uses logical name - Content Provider will find/create the correct physical folder.
 */
async function ensureFormTypeFolder(userGuid: string, formName: string): Promise<boolean> {
  const now = new Date().toISOString();
  const folderConfigYaml = yaml.dump({
    id: crypto.randomUUID ? crypto.randomUUID() : generateSimpleGuid(),
    type: 'Folder',
    name: formName,
    createdAt: now,
    updatedAt: now,
  });

  try {
    // Use logical names: repos/<userGuid>/forms/<formName>
    await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'CreateItem',
      'root',
      'repos',
      userGuid,
      'forms',
      formName,
      folderConfigYaml
    ]);
    console.log('[FormStorage] Created form type folder:', formName, 'in repo:', userGuid);
    return true;
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('already exists')) {
      console.log('[FormStorage] Form type folder already exists:', formName);
      return true;
    }
    console.error('[FormStorage] Failed to create form type folder:', error);
    return false;
  }
}

/**
 * Step 1 of two-step write: Ensure path exists using PostByNames
 * Creates the entire logical path: repos/<userGuid>/forms/<formName>/<recordKey>
 * 
 * PostByNames:
 * - Creates missing folders along the way (forms, formName)
 * - Creates the item for recordKey
 * - Returns info about created/found item
 * - Is idempotent - can be called multiple times safely
 */
async function ensurePathByPostByNames(
  userGuid: string,
  formName: string,
  recordKey: string
): Promise<boolean> {
  try {
    // Use PostByNames to ensure the entire path exists
    // This creates all missing folders and the item in one call
    await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'PostByNames',
      'root',
      'repos',
      userGuid,
      'forms',
      formName,
      recordKey
    ]);

    console.log('[FormStorage] PostByNames ensured path exists:', userGuid, formName, recordKey);
    return true;
  } catch (error) {
    console.error('[FormStorage] PostByNames failed:', error);
    return false;
  }
}

/**
 * Step 2 of two-step write: Write body content using WriteFile
 * Writes body.yaml to: repos/<userGuid>/forms/<formName>/<recordKey>/body.yaml
 * 
 * Should be called after ensurePathByPostByNames to guarantee the path exists.
 */
async function writeFormBody(
  userGuid: string,
  formName: string,
  recordKey: string,
  recordData: FormRecord
): Promise<boolean> {
  // Convert record to YAML for body
  const bodyYaml = yaml.dump(recordData);

  try {
    // Write body.yaml content using logical names
    await invokeContentProvider([
      'IRepoService',
      'IItemWorker',
      'WriteFile',
      'root',
      'repos',
      userGuid,
      'forms',
      formName,
      recordKey,
      'body.yaml',
      bodyYaml
    ]);

    console.log('[FormStorage] Written form body:', userGuid, formName, recordKey);
    return true;
  } catch (error) {
    console.error('[FormStorage] WriteFile failed:', error);
    return false;
  }
}

/**
 * Save a form record using two-step write flow:
 * 1. PostByNames - ensure path exists
 * 2. WriteFile - write body content
 * 
 * Uses logical names - Content Provider will find/create the correct physical folder.
 */
async function saveFormRecordNode(
  userGuid: string,
  formName: string,
  recordKey: string,
  recordData: FormRecord
): Promise<boolean> {
  try {
    // Step 1: Ensure path exists (PostByNames)
    const pathEnsured = await ensurePathByPostByNames(userGuid, formName, recordKey);
    if (!pathEnsured) {
      console.error('[FormStorage] Failed to ensure path exists');
      return false;
    }

    // Step 2: Write body content (WriteFile)
    const bodyWritten = await writeFormBody(userGuid, formName, recordKey, recordData);
    if (!bodyWritten) {
      console.error('[FormStorage] Failed to write body');
      return false;
    }

    console.log('[FormStorage] Saved form record:', userGuid, formName, recordKey);
    return true;
  } catch (error) {
    console.error('[FormStorage] Failed to save form record:', error);
    return false;
  }
}

/**
 * Generate a simple GUID-like string (fallback if crypto.randomUUID not available)
 */
function generateSimpleGuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Result of form save operation with debug information
 */
export interface FormSaveResult {
  success: boolean;
  error?: string;
  debug?: {
    userGuid: string;
    recordKey: string;
    formName: string;
    timestamp: string;
    cpApiUrl: string;
    logicalPath: string;
  };
}

/**
 * Main function to save a form record through Content Provider API
 * 
 * This function uses logical names via GetByNames mechanism:
 * 1. Ensures user repository exists (using userGuid as repo ID)
 * 2. Ensures forms folder exists (logical name: "forms")
 * 3. Ensures form type folder exists (logical name: <formName>)
 * 4. Creates new node for this specific record (logical name: <recordKey>)
 * 5. Writes body.yaml with form data
 * 
 * Logical path: repos/<userGuid>/forms/<formName>/<recordKey>
 * Content Provider will find/create the correct physical folders by checking config.yaml.
 * 
 * @param userGuid - GUID of the user (will be used as repo ID)
 * @param formName - Name of the form ("action", "lead")
 * @param recordKey - Unique key for this record (YYMMDD_HHMMSS format)
 * @param recordData - The form data to save
 * @returns Promise<FormSaveResult> - result with debug info
 */
export async function saveFormViaContentProvider(
  userGuid: string,
  formName: string,
  recordKey: string,
  recordData: FormRecord
): Promise<FormSaveResult> {
  console.log('[FormStorage] Saving form via Content Provider:', {
    userGuid,
    formName,
    recordKey,
  });

  try {
    // Step 1: Ensure user repository exists
    await ensureUserRepo(userGuid);

    // Step 2: Ensure forms folder exists
    await ensureFormsFolder(userGuid);

    // Step 3: Ensure form type folder exists
    await ensureFormTypeFolder(userGuid, formName);

    // Step 4: Save the form record
    const saved = await saveFormRecordNode(userGuid, formName, recordKey, recordData);

    if (saved) {
      return {
        success: true,
        debug: {
          userGuid,
          recordKey,
          formName,
          timestamp: new Date().toISOString(),
          cpApiUrl: process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055',
          logicalPath: `repos/${userGuid}/forms/${formName}/${recordKey}`,
        },
      };
    } else {
      return {
        success: false,
        error: 'Failed to save form record',
        debug: {
          userGuid,
          recordKey,
          formName,
          timestamp: new Date().toISOString(),
          cpApiUrl: process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055',
          logicalPath: `repos/${userGuid}/forms/${formName}/${recordKey}`,
        },
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[FormStorage] Error saving form:', error);
    return {
      success: false,
      error: errorMsg,
      debug: {
        userGuid,
        recordKey,
        formName,
        timestamp: new Date().toISOString(),
        cpApiUrl: process.env.CONTENT_PROVIDER_API_URL || 'http://localhost:5055',
        logicalPath: `repos/${userGuid}/forms/${formName}/${recordKey}`,
      },
    };
  }
}

/**
 * Get the logical path for a form record (for documentation/debugging)
 * Returns: repos/<userGuid>/forms/<formName>/<recordKey>
 */
export function getFormRecordPath(
  userGuid: string,
  formName: string,
  recordKey: string
): string {
  return `repos/${userGuid}/forms/${formName}/${recordKey}`;
}

/**
 * Get the physical path for a form record in cp-root
 * Returns: cp-root/repos/<userGuid>/01/01/<recordKey>/body.yaml
 */
export function getFormRecordPhysicalPath(
  userGuid: string,
  formName: string,
  recordKey: string
): string {
  return `cp-root/repos/${userGuid}/01/01/${recordKey}/body.yaml`;
}

/**
 * Folder structure for displaying in Folders UI
 */
export interface FolderItem {
  name: string;
  address?: string;
  type: string;
  id?: string;
  children?: FolderItem[];
  body?: Record<string, unknown>;
}

/**
 * Parse YAML result from Content Provider into folder structure
 */
function parseYamlResult(yamlStr: string): FolderItem[] {
  try {
    const parsed = yaml.load(yamlStr) as Record<string, unknown>;
    const items = parsed.items as Array<Record<string, unknown>> | undefined;
    if (!items) return [];
    
    return items.map(item => ({
      name: (item.name as string) || '',
      address: (item.address as string) || '',
      type: (item.type as string) || 'Unknown',
      id: (item.id as string) || '',
      children: [],
    }));
  } catch {
    return [];
  }
}


/**
 * Result of a single Content Provider call with full debug info
 */
export interface CpCallResult {
  step: string;
  service: string;
  worker: string;
  method: string;
  args: string[];
  rawRequest: Record<string, unknown>;
  rawResponse: string;
  parsedResponse: Record<string, unknown> | null;
  parseError: string | null;
  error: string | null;
}

/**
 * Get forms folder structure for a user using logical names via GetByNames
 * Returns the structure under repos/<userGuid>/forms/ (logical name: "forms")
 * 
 * Uses logical names - Content Provider will find the correct physical folders by checking config.yaml.
 * 
 * Returns:
 * - formsFolder: the forms folder structure
 * - actionRecords: list of action records with their bodies
 * - leadRecords: list of lead records with their bodies
 * - cpCalls: detailed log of all Content Provider calls made
 * - error: if any error occurred
 */
export async function getFormsFolderStructure(userGuid: string): Promise<{
  formsFolder?: FolderItem;
  actionRecords?: Array<{ recordKey: string; body?: Record<string, unknown> }>;
  leadRecords?: Array<{ recordKey: string; body?: Record<string, unknown> }>;
  cpCalls?: CpCallResult[];
  error?: string;
}> {
  const cpCalls: CpCallResult[] = [];
  
  try {
    // Step 1: Get forms folder using logical name "forms"
    // Pattern: GetByNames(<repoKey>, "forms")
    // Where repoKey is the user's repository identifier
    const formsArgs = ['IRepoService', 'IItemWorker', 'GetByNames', userGuid, 'forms'];
    const formsCall: CpCallResult = {
      step: 'Get forms folder',
      service: 'IRepoService',
      worker: 'IItemWorker',
      method: 'GetByNames',
      args: formsArgs,
      rawRequest: {},
      rawResponse: '',
      parsedResponse: null,
      parseError: null,
      error: null,
    };
    
    try {
      const formsResult = await invokeContentProvider(formsArgs);
      formsCall.rawResponse = formsResult.result || '';
      
      if (formsResult.result) {
        formsCall.parsedResponse = yaml.load(formsResult.result) as Record<string, unknown>;
      }
    } catch (e) {
      formsCall.error = e instanceof Error ? e.message : String(e);
    }
    cpCalls.push(formsCall);
    
    const formsResult = await invokeContentProvider(formsArgs);
    if (!formsResult.result) {
      return { error: 'Forms folder not found', cpCalls };
    }
    
    const formsChildren = parseYamlResult(formsResult.result);
    const formsFolder: FolderItem = {
      name: 'forms',
      type: 'Folder',
      children: formsChildren,
    };
    
    // Find actions and leads folders by logical name (plural forms)
    const actionsFolder = formsChildren.find(c => c.name === 'actions');
    const leadsFolder = formsChildren.find(c => c.name === 'leads');
    
    const actionRecords: Array<{ recordKey: string; body?: Record<string, unknown> }> = [];
    const leadRecords: Array<{ recordKey: string; body?: Record<string, unknown> }> = [];
    
    // Step 2: Get actions records using logical name "actions"
    // Pattern: GetByNames(<repoKey>, "forms", "actions")
    if (actionsFolder) {
      const actionsArgs = ['IRepoService', 'IItemWorker', 'GetByNames', userGuid, 'forms', 'actions'];
      const actionsCall: CpCallResult = {
        step: 'Get actions folder',
        service: 'IRepoService',
        worker: 'IItemWorker',
        method: 'GetByNames',
        args: actionsArgs,
        rawRequest: {},
        rawResponse: '',
        parsedResponse: null,
        parseError: null,
        error: null,
      };
      
      try {
        const actionsResult = await invokeContentProvider(actionsArgs);
        actionsCall.rawResponse = actionsResult.result || '';
        
        if (actionsResult.result) {
          actionsCall.parsedResponse = yaml.load(actionsResult.result) as Record<string, unknown>;
        }
        
        if (actionsResult.result) {
          const actionsChildren = parseYamlResult(actionsResult.result);
          for (const child of actionsChildren) {
            // Step 3: Get each action record body
            // Pattern: GetByNames(<repoKey>, "forms", "actions", "<recordKey>")
            const recordArgs = ['IRepoService', 'IItemWorker', 'GetByNames', userGuid, 'forms', 'actions', child.name];
            const recordCall: CpCallResult = {
              step: `Get action record: ${child.name}`,
              service: 'IRepoService',
              worker: 'IItemWorker',
              method: 'GetByNames',
              args: recordArgs,
              rawRequest: {},
              rawResponse: '',
              parsedResponse: null,
              parseError: null,
              error: null,
            };
            
            try {
              const recordResult = await invokeContentProvider(recordArgs);
              recordCall.rawResponse = recordResult.result || '';
              
              if (recordResult.result) {
                recordCall.parsedResponse = yaml.load(recordResult.result) as Record<string, unknown>;
              }
              
              actionRecords.push({
                recordKey: child.name,
                body: recordCall.parsedResponse || undefined,
              });
            } catch (e) {
              recordCall.error = e instanceof Error ? e.message : String(e);
            }
            cpCalls.push(recordCall);
          }
        }
      } catch (e) {
        actionsCall.error = e instanceof Error ? e.message : String(e);
      }
      cpCalls.push(actionsCall);
    }
    
    // Step 4: Get leads records using logical name "leads"
    // Pattern: GetByNames(<repoKey>, "forms", "leads")
    if (leadsFolder) {
      const leadsArgs = ['IRepoService', 'IItemWorker', 'GetByNames', userGuid, 'forms', 'leads'];
      const leadsCall: CpCallResult = {
        step: 'Get leads folder',
        service: 'IRepoService',
        worker: 'IItemWorker',
        method: 'GetByNames',
        args: leadsArgs,
        rawRequest: {},
        rawResponse: '',
        parsedResponse: null,
        parseError: null,
        error: null,
      };
      
      try {
        const leadsResult = await invokeContentProvider(leadsArgs);
        leadsCall.rawResponse = leadsResult.result || '';
        
        if (leadsResult.result) {
          leadsCall.parsedResponse = yaml.load(leadsResult.result) as Record<string, unknown>;
        }
        
        if (leadsResult.result) {
          const leadsChildren = parseYamlResult(leadsResult.result);
          for (const child of leadsChildren) {
            // Step 5: Get each lead record body
            // Pattern: GetByNames(<repoKey>, "forms", "leads", "<recordKey>")
            const recordArgs = ['IRepoService', 'IItemWorker', 'GetByNames', userGuid, 'forms', 'leads', child.name];
            const recordCall: CpCallResult = {
              step: `Get lead record: ${child.name}`,
              service: 'IRepoService',
              worker: 'IItemWorker',
              method: 'GetByNames',
              args: recordArgs,
              rawRequest: {},
              rawResponse: '',
              parsedResponse: null,
              parseError: null,
              error: null,
            };
            
            try {
              const recordResult = await invokeContentProvider(recordArgs);
              recordCall.rawResponse = recordResult.result || '';
              
              if (recordResult.result) {
                recordCall.parsedResponse = yaml.load(recordResult.result) as Record<string, unknown>;
              }
              
              leadRecords.push({
                recordKey: child.name,
                body: recordCall.parsedResponse || undefined,
              });
            } catch (e) {
              recordCall.error = e instanceof Error ? e.message : String(e);
            }
            cpCalls.push(recordCall);
          }
        }
      } catch (e) {
        leadsCall.error = e instanceof Error ? e.message : String(e);
      }
      cpCalls.push(leadsCall);
    }
    
    return {
      formsFolder,
      actionRecords: actionRecords.sort((a, b) => b.recordKey.localeCompare(a.recordKey)),
      leadRecords: leadRecords.sort((a, b) => b.recordKey.localeCompare(a.recordKey)),
      cpCalls,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { error: errorMsg, cpCalls };
  }
}
