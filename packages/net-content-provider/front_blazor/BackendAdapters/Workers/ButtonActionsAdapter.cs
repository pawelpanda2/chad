using BackendAdapters.Names;

namespace BackendAdapters.Workers;

public class ButtonActionsAdapter
{
    private readonly BackendAdapter _backend;

    public ButtonActionsAdapter(
        BackendAdapter backend)
    {
        _backend = backend;
    }
    
    public async Task OpenConfig(
        (string Repo, string Loca) adrTuple)
    {
        await _backend.InvokeStringArgsApi(
            SNames.MainButtonActionsService,
            SNames.FileWorker,
            SNames.OpenConfig,
            adrTuple.Repo,
            adrTuple.Loca);
    }

    public async Task OpenBody(
        (string Repo, string Loca) adrTuple)
    {
        await _backend.InvokeStringArgsApi(
            SNames.MainButtonActionsService,
            SNames.FileWorker,
            SNames.OpenBody,
            adrTuple.Repo,
            adrTuple.Loca);
    }
    
    public async Task OpenItemFolder(
        (string Repo, string Loca) adrTuple)
    {
        await _backend.InvokeStringArgsApi(
            SNames.MainButtonActionsService,
            SNames.FolderWorker,
            SNames.Open,
            adrTuple.Repo,
            adrTuple.Loca);
    }
    
    public async Task OpenTerminal(
        (string Repo, string Loca) adrTuple)
    {
        await _backend.InvokeStringArgsApi(
            SNames.MainButtonActionsService,
            SNames.TerminalWorker,
            SNames.Open,
            adrTuple.Repo,
            adrTuple.Loca);
    }
}
