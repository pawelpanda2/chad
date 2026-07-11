using SharpFileServiceProg.Recursively;

namespace SharpFileServiceProg.Service2;

public class GetFilesQFoldersNames
{
    private VisitDirectoriesRecursively rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;
    List<string> result;
    DirectoryInfo inputDirInfo;

    public GetFilesQFoldersNames()
    {
        rvd = new VisitDirectoriesRecursively();
        ClearAll();
        InitializeActions();
    }

    private void ClearAll()
    {
        inputDirInfo = null;
    }

    public List<string> Do(string path)
    {
        result = new List<string>();
        inputDirInfo = new DirectoryInfo(path);
        rvd.Visit(path, fileAction, folderAction);
        ClearAll();
        return result;
    }

    private void InitializeActions()
    {
        fileAction = new Action<FileInfo>((fileInfo) =>
        {
            result.Add(fileInfo.FullName);
        });

        folderAction = new Action<DirectoryInfo>((directionryInfo) =>
        {
            result.Add(directionryInfo.FullName);
        });
    }
}