namespace SharpFileServiceProg.Recursively;

public class GetSizesByFileExtension2
{
    private VisitDirectoriesRecursively rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;
    long generalSize;
    long tempSize;
    private Dictionary<string, Dictionary<string, string>> dictionarySize;

    public GetSizesByFileExtension2()
    {
        rvd = new VisitDirectoriesRecursively();
        InitializeActions();
    }

    public Dictionary<string, Dictionary<string, string>> Do
        (string path, string[] typesToCount = null)
    {
        dictionarySize = new Dictionary<string, Dictionary<string, string>>();
        rvd.Visit(path, fileAction, folderAction);
        return dictionarySize;
    }

    private void InitializeActions()
    {
        fileAction = new Action<FileInfo>((fileInfo) =>
        {
            var extension = fileInfo.Extension;

            if (!dictionarySize.ContainsKey(extension))
            {
                var tmp2 = new Dictionary<string, string>();
                dictionarySize.Add(extension, tmp2);
            }
                
            var tmp = dictionarySize[extension];
            var size = rvd.FormatBytes(fileInfo.Length);
            tmp.Add(fileInfo.FullName, size);
        });

        folderAction = new Action<DirectoryInfo>((directionryInfo) =>
        {
        });
    }
}