using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.Index;
using SharpRepoServiceProg.Duplications.Operations.Files;

namespace SharpOperationsProg.Operations.UniItemAddress;

internal class GetRepoAddresses : IRepoAddressesObtainer
{
    private readonly IFileService _fileService;
    private List<string> locaList;
    private IParentVisit vdr;
    private string _repoName;
    private readonly IIndexOperations _indexOperations;

    public GetRepoAddresses(
        IFileService fileService,
        IIndexOperations indexOperations)
    {
        _fileService = fileService;
        _indexOperations = indexOperations;
        ReInitialize();
    }

    private void ReInitialize()
    {
        locaList = new List<string>();
    }

    public List<string> Visit(string path)
    {
        _repoName = System.IO.Path.GetFileName(path);
        vdr = _fileService.File.GetNewVisitDirectoriesRecursivelyWithParentMemory();
        var fileAction = FileAction;
        var folderAction = FolderAction;
        vdr.Visit(path, fileAction, folderAction);
        var result = new List<string>(locaList);
        ReInitialize();
        return result;
    }

    private void FileAction(FileInfo fileInfo)
    {
    }

    private void FolderAction(DirectoryInfo directoryInfo)
    {
        if (_indexOperations
            .IsCorrectIndex(directoryInfo.FullName, out var index))
        {
            var parents = vdr.Parents;
            var names = parents.Select(x => x.Name);
            var loca = string.Join('/', names);
            locaList.Add(loca);
        }
    }
}
