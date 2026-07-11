namespace SharpFileServiceProg.Recursively;

internal class GetSizesAndCountByFileExtension
{
    private VisitDirectoriesRecursively rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;
    long generalSize;
    long tempSize;
    private Dictionary<string, (long, int)> dictionarySize;

    public GetSizesAndCountByFileExtension()
    {
        rvd = new VisitDirectoriesRecursively();
        ClearAll();
        InitializeActions();
    }

    private void ClearAll()
    {
        generalSize = 0;
        tempSize = 0;
        dictionarySize = new Dictionary<string, (long, int)>();
    }

    public List<List<string>> Do(string path, string[] typesToCount = null)
    {
        rvd.Visit(path, fileAction, folderAction);
        var result = dictionarySize.Select(x => new List<string> { rvd.FormatBytes(x.Value.Item1), x.Key.ToString(), x.Value.Item2.ToString() }).ToList();
        var temp = dictionarySize.Sum(x => x.Value.Item1);
        if (generalSize != temp) { throw new Exception(); }
        generalSize = temp;
        result.Insert(0, new List<string> { path, rvd.FormatBytes(generalSize), string.Empty });
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
                dictionarySize.Add(extension, (0, 0));
            }

            var size = dictionarySize[extension].Item1;
            var count = dictionarySize[extension].Item2;

            dictionarySize[extension] = (size += fileInfo.Length, count + 1);
            tempSize += fileInfo.Length;
        });

        folderAction = new Action<DirectoryInfo>((directionryInfo) =>
        {
            generalSize += tempSize;
            tempSize = 0;
        });
    }
}