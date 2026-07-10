using SharpButtonActionsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Files;

public class FileWorker : IFileWorker
{
    private readonly IRepoService _repo;
    private readonly MacFileWorker _mac;
    private readonly WindowsFileWorker _windows;
    
    public FileWorker(
        IOperationsService operations,
        IRepoService repo)
    {
        _repo = repo;
        _mac = new MacFileWorker(operations);
        _windows = new WindowsFileWorker();
    }
    
    public void OpenBody(
        string repo,
        string loca)
    {
        string? path = _repo.Methods
            .GetBodyPath((repo, loca));
        _mac.TryOpenFile(path);
        _windows.TryOpenFile(path);
    }
    
    public void OpenConfig(
        string repo,
        string loca)
    {
        string? path = _repo.Methods
            .GetConfigPath((repo, loca));
        _mac.TryOpenFile(path);
        _windows.TryOpenFile(path);
    }
}
