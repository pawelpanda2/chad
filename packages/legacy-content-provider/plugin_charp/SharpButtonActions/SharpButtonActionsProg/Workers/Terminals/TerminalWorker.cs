using SharpButtonActionsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Terminals;

public class TerminalWorker : ITerminalWorker
{
    private readonly MacTerminalWorker _mac;
    private readonly WindowsTerminalWorker _windows;
    private readonly IRepoService _repo;

    public TerminalWorker(
        IOperationsService operations,
        IRepoService repo)
    {
        _repo = repo;
        _mac = new MacTerminalWorker(operations);
        _windows = new WindowsTerminalWorker();
    }
    
    public void Open(
        string repo,
        string loca)
    {
        string? path = _repo.Methods
            .GetItemPath((repo, loca));
        _mac.TryOpenTerminal(path);
        _windows.TryOpenTerminal(path);
    }
}
