namespace SharpButtonActionsProg.AAPublic;

public interface IMainButtonActionsService
{
    public IFolderWorker Folder { get; }
    public ITerminalWorker Terminal { get; }
    public IFileWorker File { get; }
}
