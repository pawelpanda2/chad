namespace SharpOperationsProg.Operations.Path;

public interface IPathsOperations
{
    //string FindFolder(string searchFolderName, string inputFolderPath, string expression);
    string MoveDirectoriesUp(string path, int level);
    string GetBinPath();
    List<(string, string)> GetFolderQFileList(string path);
    string TryGetBinPath(out bool success);
    void CreateMissingDirectories(string path);
    string GetStartupProjectFolderPath();
    string GetProjectFolderPath(string projectName);
}