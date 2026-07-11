namespace SharpFileServiceProg.Recursively;

public class GetFolderSizes
{
    private VisitDirectoriesRecursively rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;
    long generalSize;
    long tempSize;
    List<List<string>> tempResult;
    DirectoryInfo inputDirInfo;

    public GetFolderSizes()
    {
        rvd = new VisitDirectoriesRecursively();
        ClearAll();
        InitializeActions();
    }

    private void ClearAll()
    {
        generalSize = 0;
        tempSize = 0;
        tempResult = new List<List<string>>();
        inputDirInfo = null;
    }

    public List<List<string>> Do(string path)
    {
        inputDirInfo = new DirectoryInfo(path);
        rvd.Visit(path, fileAction, folderAction);
        var result = tempResult.ConvertAll(x => x);
        result.Insert(0, new List<string> { path, rvd.FormatBytes(generalSize) });
        ClearAll();
        return result;
    }

    private void InitializeActions()
    {
        fileAction = new Action<FileInfo>((fileInfo) =>
        {
            tempSize += fileInfo.Length;
        });

        folderAction = new Action<DirectoryInfo>((directionryInfo) =>
        {
            if (directionryInfo.Parent.FullName == inputDirInfo.FullName)
            {
                generalSize += tempSize;
                tempResult.Add(new List<string> { rvd.FormatBytes(tempSize), directionryInfo.FullName });
                tempSize = 0;
            }
        });
    }
}