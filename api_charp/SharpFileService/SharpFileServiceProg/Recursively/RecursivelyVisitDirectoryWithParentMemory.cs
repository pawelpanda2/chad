using SharpFileServiceProg.AAPublic;

namespace SharpFileServiceProg.Recursively;

internal class VisitDirectoriesRecursivelyWithParentMemory
    : IParentVisit
{
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> directoryAction;
    private List<string> excludedFolderList;
    public List<DirectoryInfo> Parents { get; private set; }

    public VisitDirectoriesRecursivelyWithParentMemory()
    {
        excludedFolderList = new List<string>() { ".git" };
        Parents = new List<DirectoryInfo>();
        ClearAll();
    }

    public void Visit(
        string path,
        Action<FileInfo> fileAction,
        Action<DirectoryInfo> directoryAction)
    {
        this.fileAction = fileAction;
        this.directoryAction = directoryAction;
        var directories = Directory.GetDirectories(path);
        var mainDirInfo = new DirectoryInfo(path);
        VisitOnlyFiles(mainDirInfo);

        foreach (var dir in directories)
        {
            var dirInfo = new DirectoryInfo(dir);
            VisitDirectory(dirInfo);
        }

        ClearAll();
    }

    private void VisitOnlyFiles(DirectoryInfo d)
    {
        FileInfo[] fis = d.GetFiles();
        foreach (FileInfo fi in fis)
        {
            fileAction(fi);
        }
    }

    private void VisitDirectory(DirectoryInfo d)
    {
        if (excludedFolderList.Any(x => x == d.Name))
        {
            return;
        }
        Parents.Add(d);

        VisitOnlyFiles(d);

        DirectoryInfo[] dis = d.GetDirectories();
        foreach (DirectoryInfo di in dis)
        {
            VisitDirectory(di);
        }

        directoryAction(d);
        Parents.Remove(d);
    }

    private void ClearAll()
    {
        fileAction = null;
        directoryAction = null;
    }
}