using System.Xml.Linq;
using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.FilesRecursively;

internal class AppendNotepadWorkspace
{
    private readonly IOperationsService operationsService;
    private IFileVisit rvd;
    private Action<FileInfo> fileAction;
    private Action<DirectoryInfo> folderAction;

    private XElement mainElement;
    private DirectoryInfo mainFolderInfo;
    private Dictionary<string, XElement> folderElementsDict;

    public AppendNotepadWorkspace(
        IOperationsService operationsService)
    {
        this.operationsService = operationsService;

        rvd = operationsService.File.GetNewRecursivelyVisitDirectory();
        Clear();
    }

    private void Clear()
    {
        folderElementsDict = new Dictionary<string, XElement>();
    }

    public XElement Do(string path)
    {
        var mainFolderInfo = new DirectoryInfo(path);
        var mainElement = new XElement("Project");
        var name = GetName(mainFolderInfo);
        mainElement.SetAttributeValue("name", name);
        this.mainElement = mainElement;
        this.mainFolderInfo = mainFolderInfo;

        var relativePath = GetRelativePath(mainFolderInfo);
        folderElementsDict.Add(relativePath, mainElement);

        Initialize01();
        rvd.Visit(path, fileAction, folderAction);
        ConnectParents();
        Initialize02();
        rvd.Visit(path, fileAction, folderAction);
        Clear();

        return mainElement;
    }

    private void Initialize01()
    {
        fileAction = new Action<FileInfo>((fileInfo) => { });

        folderAction = new Action<DirectoryInfo>((folderInfo) =>
        {
            var relativePath = GetRelativePath(folderInfo);
            var newElement = new XElement("Folder");
            var name = GetName(folderInfo);
            newElement.SetAttributeValue("name", name);
            folderElementsDict.Add(relativePath, newElement);
        });
    }

    private void ConnectParents()
    {
        foreach (var item in folderElementsDict)
        {
            var relativePath = item.Key;
            if (relativePath.Length >= 2)
            {
                var split = relativePath.Split('\\', '/');
                var parentRelativePath = string.Join('\\', split.Take(split.Length - 1));

                folderElementsDict.TryGetValue(parentRelativePath, out var parentElement);
                if (parentElement != null)
                {
                    parentElement.Add(item.Value);
                }
                else
                {
                    throw new Exception();
                }
            }
        }
    }

    private void Initialize02()
    {
        fileAction = new Action<FileInfo>((fileInfo) =>
        {
            if (fileInfo.Name != "index.php")
            {
                var newElement = new XElement("File");
                var name = GetName(fileInfo);
                newElement.SetAttributeValue("name", name);
                var relativePath = GetRelativePath(fileInfo);

                var parentRelativePath = System.IO.Path.GetDirectoryName(relativePath);
                folderElementsDict.TryGetValue(parentRelativePath, out var parent);
                if (parent != null)
                {
                    parent.Add(newElement);
                }
                else
                {
                    throw new Exception();
                }
            }
        });

        folderAction = new Action<DirectoryInfo>((folderInfo) => { });
    }

    private string GetName(FileSystemInfo fileSystemInfo)
    {
        if (fileSystemInfo is FileInfo)
        {
            return fileSystemInfo.FullName;
        }
        if (fileSystemInfo is DirectoryInfo)
        {
            // todo
            var name = ""; // fileSystemInfo.Name + "_" + repoService.Methods.(fileSystemInfo.FullName);
            return name;
        }

        throw new Exception();
    }

    private string GetRelativePath(FileSystemInfo folderInfo)
    {
        var relativePath = folderInfo.FullName.Remove(0, mainFolderInfo.FullName.Count()).TrimStart('/').TrimStart('\\');
        return relativePath;
    }

    private void AddFile(XElement parent, string name)
    {
        var newElement = new XElement("File");
        newElement.SetAttributeValue("name", name);
        parent.Add(newElement);
    }

    private XElement CreateFolderElement(XElement parent, string path)
    {
        var newElement = new XElement("Folder");
        newElement.SetAttributeValue("name", path);
        parent.Add(newElement);
        return newElement;
    }
}