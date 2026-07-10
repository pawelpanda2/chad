import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

// Path to the C# SimpleRun project, relative to this script's location
const SHARP_PROJECT_PATH = path.join(__dirname, '..', '..', 'charp', 'SimpleRun', 'SimpleRun.csproj');

/**
 * Invokes the C# SimpleRun application with the provided arguments.
 * 
 * @param args - Array of arguments to pass to the C# application
 * @returns Promise that resolves with the stdout output (trimmed)
 * @throws Error if the process fails (stderr will be in the error message)
 */
export async function invokeSharp(args: string[]): Promise<string> {
  const dotnetArgs = ['run', '--project', SHARP_PROJECT_PATH, '--', ...args];

  try {
    const { stdout, stderr } = await execFileAsync('dotnet', dotnetArgs, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    if (stderr && stderr.trim()) {
      // Log stderr but don't fail if it's just informational messages
      console.error(`C# stderr: ${stderr.trim()}`);
    }

    return stdout.trim();
  } catch (error: any) {
    // Extract error details
    const errorMessage = error.message || 'Unknown error';
    const stderrOutput = error.stderr ? error.stderr.toString().trim() : '';
    const stdoutOutput = error.stdout ? error.stdout.toString().trim() : '';
    
    let errorDetails = `Failed to execute C# SimpleRun: ${errorMessage}`;
    if (stderrOutput) {
      errorDetails += `\nStderr: ${stderrOutput}`;
    }
    if (stdoutOutput) {
      errorDetails += `\nStdout: ${stdoutOutput}`;
    }

    throw new Error(errorDetails);
  }
}

/**
 * Convenience wrapper for calling IRepoService.IItemWorker.GetItem
 * 
 * @param repo - The repository ID
 * @param loca - The location within the repository
 * @returns Promise that resolves with the item content
 */
export async function getItem(repo: string, loca: string): Promise<string> {
  const args = [
    'IRepoService',
    'IItemWorker',
    'GetItem',
    repo,
    loca
  ];

  return invokeSharp(args);
}

/**
 * Generic method to invoke any service/method through the C# application
 * 
 * @param service - Service name (e.g., 'IRepoService')
 * @param worker - Worker name (e.g., 'IItemWorker')
 * @param method - Method name (e.g., 'GetItem')
 * @param additionalArgs - Additional arguments to pass
 * @returns Promise that resolves with the result
 */
export async function invokeMethod(
  service: string,
  worker: string,
  method: string,
  ...additionalArgs: string[]
): Promise<string> {
  const args = [service, worker, method, ...additionalArgs];
  return invokeSharp(args);
}