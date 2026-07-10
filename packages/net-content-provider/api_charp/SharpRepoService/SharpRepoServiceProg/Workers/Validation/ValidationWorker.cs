using System;
using System.IO;
using SharpContainerProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.APublic;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.Validation;

public class ValidationWorker
{
    private readonly PathWorker _path;
    private readonly CustomOperationsService _operations;

    public ValidationWorker()
    {
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
        _operations = MyBorder.MyContainer.Resolve<CustomOperationsService>();
    }

    /// <summary>
    /// Validates that all child folders under the given parent have numeric names.
    /// This is a critical integrity check - non-numeric folder names indicate repository corruption.
    /// </summary>
    /// <param name="parentAdrTuple">The parent folder address tuple</param>
    /// <param name="invalidFolderName">The name of the first non-numeric folder found (null if valid)</param>
    /// <returns>true if all child folders have numeric names, false otherwise</returns>
    public bool ValidateChildFoldersAreNumeric(
        (string Repo, string Loca) parentAdrTuple,
        out string invalidFolderName)
    {
        invalidFolderName = null;
        string parentPath = _path.GetItemPath(parentAdrTuple);
        
        if (!Directory.Exists(parentPath))
        {
            // Parent doesn't exist yet, so validation passes (will be created)
            return true;
        }

        var directories = Directory.GetDirectories(parentPath);
        
        foreach (var dir in directories)
        {
            string folderName = Path.GetFileName(dir);
            
            // Skip special folders like .git
            if (folderName.StartsWith("."))
            {
                continue;
            }

            // Check if folder name is numeric (valid index)
            if (!_operations.Index.TryStringToIndex(folderName, out _))
            {
                // Found a non-numeric folder name - this is repository corruption
                invalidFolderName = folderName;
                return false;
            }
        }

        return true;
    }

    /// <summary>
    /// Validates that all child folders under a parent are numeric before creating new items.
    /// This ensures repository integrity by enforcing the rule that item children must be 
    /// numeric folders (e.g., "001", "002") rather than logical names.
    /// 
    /// Special folders starting with '.' (e.g., .git, .vscode) are ignored as they are
    /// system/configuration folders, not item folders.
    /// </summary>
    /// <param name="parentAdrTuple">The parent address tuple (Repo, Loca)</param>
    /// <param name="errorMessage">Error message describing the validation failure (null if valid)</param>
    /// <param name="invalidFolderName">The name of the invalid folder (null if valid)</param>
    /// <param name="parentPath">The full physical path of the parent (for error reporting)</param>
    /// <returns>true if validation passes, false if non-numeric child folder found</returns>
    public bool ValidateParentBeforeCreateChild(
        (string Repo, string Loca) parentAdrTuple,
        out string errorMessage,
        out string invalidFolderName,
        out string parentPath)
    {
        errorMessage = null;
        invalidFolderName = null;
        parentPath = null;

        if (!ValidateChildFoldersAreNumeric(parentAdrTuple, out invalidFolderName))
        {
            parentPath = _path.GetItemPath((parentAdrTuple.Repo, parentAdrTuple.Loca));
            
            errorMessage = 
                $"Repository structure violation: Non-numeric child folder '{invalidFolderName}' " +
                $"found under parent at '{parentPath}' (Repo: {parentAdrTuple.Repo}, Loca: {parentAdrTuple.Loca}). " +
                $"All item child folders must be numeric (e.g., '001', '002'). Logical item names are stored in config.yaml. " +
                $"This indicates either repository corruption or manual creation of folders with logical names.";
            
            return false;
        }

        return true;
    }

    /// <summary>
    /// Validates that a concrete item loca contains only numeric path segments.
    /// This protects Put operations from creating logical-name folders like
    /// "03/06/81/status" instead of addressing an existing numeric item.
    /// </summary>
    public bool ValidateItemLocaBeforePut(
        (string Repo, string Loca) adrTuple,
        out string errorMessage,
        out string invalidSegment)
    {
        errorMessage = null;
        invalidSegment = null;

        if (string.IsNullOrWhiteSpace(adrTuple.Loca))
        {
            return true;
        }

        string[] segments = adrTuple.Loca
            .Split('/', StringSplitOptions.RemoveEmptyEntries);

        foreach (string segment in segments)
        {
            if (!_operations.Index.TryStringToIndex(segment, out _))
            {
                invalidSegment = segment;
                errorMessage =
                    $"Invalid Put target loca '{adrTuple.Loca}' for repo '{adrTuple.Repo}'. " +
                    $"Segment '{invalidSegment}' is not numeric. " +
                    $"Put must target an existing numeric item path; logical names belong in config.yaml name, not in folder names.";
                return false;
            }
        }

        return true;
    }
}