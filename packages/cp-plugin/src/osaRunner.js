const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Get the directory where the server script is located
const scriptDir = path.join(__dirname, '..', 'OsaScripts');

// Temporary directory for generated scripts
const tempDir = path.join(os.tmpdir(), 'plugin-nodejs-osa');

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * Runs an OSA script with the given file path or folder path.
 * The script template is read, placeholders are replaced, and the script is executed.
 * 
 * @param {string} scriptName - Name of the script file (e.g., 'OpenFile4.scpt')
 * @param {string} targetPath - Path to open (file or folder)
 * @param {Object} replacements - Key-value pairs for placeholder replacement
 * @returns {Promise<void>}
 */
function runOsaScript(scriptName, targetPath, replacements = {}) {
  return new Promise((resolve, reject) => {
    const templatePath = path.join(scriptDir, scriptName);
    
    // Check if template script exists
    if (!fs.existsSync(templatePath)) {
      reject(new Error(`Script template not found: ${templatePath}`));
      return;
    }

    // Read the template script
    let scriptContent = fs.readFileSync(templatePath, 'utf8');

    // Add default replacements
    replacements['[[filePath]]'] = targetPath;
    replacements['[[folderPath]]'] = targetPath;

    // Replace placeholders
    for (const [key, value] of Object.entries(replacements)) {
      scriptContent = scriptContent.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
    }

    // Write the processed script to a temp file
    const tempScriptPath = path.join(tempDir, `script-${Date.now()}.scpt`);
    fs.writeFileSync(tempScriptPath, scriptContent);

    // Run the script using osascript
    execFile('osascript', [tempScriptPath], (error, stdout, stderr) => {
      // Clean up temp file
      try {
        fs.unlinkSync(tempScriptPath);
      } catch (e) {
        // Ignore cleanup errors
      }

      if (error) {
        reject(new Error(`OSA script failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

/**
 * Opens a file in Nova editor using OSA script.
 * 
 * @param {string} filePath - Full path to the file
 * @returns {Promise<void>}
 */
async function openFileInNova(filePath) {
  await runOsaScript('OpenFile4.scpt', filePath);
}

/**
 * Opens a folder in Finder using OSA script.
 * 
 * @param {string} folderPath - Full path to the folder
 * @returns {Promise<void>}
 */
async function openFolder(folderPath) {
  await runOsaScript('OpenFolder.scpt', folderPath);
}

/**
 * Opens Terminal in the specified folder using OSA script.
 * 
 * @param {string} folderPath - Full path to the folder
 * @returns {Promise<void>}
 */
async function openTerminal(folderPath) {
  await runOsaScript('OpenTerminal.scpt', folderPath);
}

module.exports = {
  runOsaScript,
  openFileInNova,
  openFolder,
  openTerminal
};