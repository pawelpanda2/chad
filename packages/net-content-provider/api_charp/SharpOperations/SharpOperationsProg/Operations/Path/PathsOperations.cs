using System.Reflection;

namespace SharpOperationsProg.Operations.Path;

internal class PathsOperations : IPathsOperations
{
    private FolderFinder folderFinder;

    public PathsOperations()
    {
        this.folderFinder = new FolderFinder();
    }

    public string FindFolder(
        string searchFolderName,
        string inputFolderPath,
        string expression)
        => folderFinder.FindFolder(
            searchFolderName,
            inputFolderPath,
            expression,
            GetType());

    public string MoveDirectoriesUp(string path, int level)
    {
        for (int i = 0; i < level; i++)
        {
            path = Directory.GetParent(path).FullName;
        }

        return path;
    }

    public List<(string, string)> GetFolderQFileList(string path)
    {
        var files = Directory.GetFiles(path);
        var folderQfileList = files
            .Select(x => (System.IO.Path.GetDirectoryName(x), System.IO.Path.GetFileName(x)))
            .ToList();
        return folderQfileList;
    }

    public string TryGetBinPath(out bool success)
    {
        try
        {
            var binPath = GetBinPath();
            success = true;
            return binPath;
        }
        catch (Exception ex)
        {
            success = false;
            return default;
        }
    }

    public string GetBinPath()
    {
        string codeBase = Assembly.GetExecutingAssembly().CodeBase;
        UriBuilder uri = new UriBuilder(codeBase);
        string path = Uri.UnescapeDataString(uri.Path);
        var tmp = System.IO.Path.GetDirectoryName(path);

        var parent = new DirectoryInfo(tmp);
        while (parent?.Name != "bin")
        {
            parent = Directory.GetParent(parent.FullName);
        }

        var binPath = parent.FullName;
        return binPath;
    }

    public void CreateMissingDirectories(string path)
    {
        var parentsPaths = new List<string>();

        for (int i = 0; i < 3; i++)
        {
            path = Directory.GetParent(path).FullName;
            parentsPaths.Insert(0, path);
        }

        foreach (var parentPath in parentsPaths)
        {
            if (!Directory.Exists(parentPath))
            {
                Directory.CreateDirectory(parentPath);
            }
        }
    }

    public string GetProjectFolderPath(string projectName)
    {
        string startupProjectFolder = default;
        var max = 7;
        var currentFolder = Directory.GetCurrentDirectory();
        var directories = Directory.GetDirectories(currentFolder);

        for (var i = 0; i < max; i++)
        {
            directories = Directory.GetDirectories(currentFolder);
            startupProjectFolder = directories.SingleOrDefault(
                x => System.IO.Path.GetFileName(x) == projectName);

            if (startupProjectFolder != default)
            {
                return startupProjectFolder;
            }

            currentFolder = MoveDirectoriesUp(currentFolder, 1);
        }

        throw new InvalidOperationException();
    }

    public string GetStartupProjectFolderPath()
    {
        string projectName = System.Reflection.Assembly.GetEntryAssembly().GetName().Name;
        string projectPath = GetProjectFolderPath(projectName);
        return projectPath;
    }
}