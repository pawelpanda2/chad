using SharpButtonActionsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Folders;

public class FolderWorker : IFolderWorker
{
    private readonly IRepoService _repo;
    private readonly MacFolderWorker _mac;
    private readonly WindowsFolderWorker _windows;
    
    public FolderWorker(
        IOperationsService operations,
        IRepoService repo)
    {
        _repo = repo;
        _mac = new MacFolderWorker(operations);
        _windows = new WindowsFolderWorker();
    }

    public void Open(
        string repo,
        string loca)
    {
        string? path = _repo.Methods
            .GetItemPath((repo, loca));
        _mac.TryOpenFolder(path);
        _windows.TryOpenFolder(path);
    }
}
