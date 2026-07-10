namespace SharpFileServiceProg.Recursively;

internal class FolderAnalyzer
{
    private readonly GetFolderSizes getFolderSizes;
    private readonly GetSizesByFileExtension getSizesByFileExtension;
    private readonly GetSizesAndCountByFileExtension getSizesAndCountByFileExtension;

    public FolderAnalyzer()
    {
        getFolderSizes = new GetFolderSizes();
        getSizesByFileExtension = new GetSizesByFileExtension();
        getSizesAndCountByFileExtension = new GetSizesAndCountByFileExtension();
    }

    public void Analysis01(string[] paths)
    {
        foreach (var path in paths)
        {
            Analysis01(path);
        }
    }

    public void Analysis01(string path)
    {
        var resultA = getFolderSizes.Do(path);
        var resultB = getSizesAndCountByFileExtension.Do(path);
        Print(resultA);
        Print(resultB);
    }

    public void Analysis02(string path)
    {
        var typesToCount = new[] { ".txt", ".php", ".png", ".jpeg", "jpg", "" };
        //var result01a = sizeWorker.GetSizesByExtensions(path, typesToCount);
        //var result01b = sizeWorker.GetFolderContentSize(path);
        //Print(result01a);
        //Print(result01b);
    }

    public void Print(List<List<string>> listA)
    {
        Console.WriteLine(string.Empty);

        foreach (var listB in listA)
        {
            var text = string.Join(" - ", listB);
            Console.WriteLine(text);
        }

        Console.WriteLine();
    }
}