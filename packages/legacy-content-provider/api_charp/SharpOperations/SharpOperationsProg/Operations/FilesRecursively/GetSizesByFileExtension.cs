namespace SharpOperationsProg.Operations.FilesRecursively;

public class GetSizesByFileExtension
{
    private VisitDirectoriesRecursively rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;
    long generalSize;
    long tempSize;
    private Dictionary<string, long> dictionarySize;

    public GetSizesByFileExtension()
    {
        rvd = new VisitDirectoriesRecursively();
        ClearAll();
        InitializeActions();
    }

    private void ClearAll()
    {
        generalSize = 0;
        tempSize = 0;
        dictionarySize = new Dictionary<string, long>();
        fileAction = null;
        folderAction = null;
    }

    public List<(string, string)> Do(string path, string[] typesToCount = null)
    {
        rvd.Visit(path, fileAction, folderAction);
        var result = dictionarySize.Select(x => (x.Key.ToString(), rvd.FormatBytes(x.Value))).ToList();
        var temp = dictionarySize.Sum(x => x.Value);
        if (generalSize != temp) { throw new Exception(); }
        generalSize = temp;
        result.Insert(0, (path, rvd.FormatBytes(generalSize)));
        ClearAll();
        return result;
    }

    private void InitializeActions()
    {
        fileAction = new Action<FileInfo>((fileInfo) =>
        {
            var extension = fileInfo.Extension;

            if (!dictionarySize.ContainsKey(extension))
            {
                dictionarySize.Add(extension, 0);
            }

            dictionarySize[extension] += fileInfo.Length;
            tempSize += fileInfo.Length;
        });

        folderAction = new Action<DirectoryInfo>((directionryInfo) =>
        {
            generalSize += tempSize;
            tempSize = 0;
        });
    }
}