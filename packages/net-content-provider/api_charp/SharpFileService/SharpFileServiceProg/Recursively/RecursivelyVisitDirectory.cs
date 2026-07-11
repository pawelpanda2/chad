using SharpFileServiceProg.AAPublic;

namespace SharpFileServiceProg.Recursively;

internal class VisitDirectoriesRecursively : IFileVisit
{
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> directoryAction;
    private List<string> excludedFolderList;

    public VisitDirectoriesRecursively()
    {
        excludedFolderList = new List<string>() { ".git" };
        ClearAll();
    }

    public string FormatBytes(long bytes)
    {
        string[] Suffix = { "B", "KB", "MB", "GB", "TB" };
        int i;
        double dblSByte = bytes;
        for (i = 0; i < Suffix.Length && bytes >= 1024; i++, bytes /= 1024)
        {
            dblSByte = bytes / 1024.0;
        }

        return string.Format("{0:0.##} {1}", dblSByte, Suffix[i]);
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

        VisitOnlyFiles(d);

        DirectoryInfo[] dis = d.GetDirectories();
        foreach (DirectoryInfo di in dis)
        {
            VisitDirectory(di);
        }

        directoryAction(d);
    }

    private void ClearAll()
    {
        fileAction = null;
        directoryAction = null;
    }
}