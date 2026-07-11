using System.Text.Json;
using BackendAdapters.Models;
using BackendAdapters.Names;

namespace BackendAdapters.Workers;

public class RepoAdapter
{
    private readonly BackendAdapter _backend;

    public RepoAdapter(
        BackendAdapter backend)
    {
        _backend = backend;
    }
    
    public async Task<(string Repo, string Loca)> GetFirstRepo()
    {
        string jsonStr =
            await _backend.InvokeStringArgsApi(
                SNames.RepoService,
                SNames.Methods,
                SNames.GetFirstRepo);
        string[]? tmp = JsonSerializer.Deserialize<string[]>(jsonStr);
        var result = (tmp[0], tmp[1]);
        return result;
    }
    
    public async Task<ItemModel[]> GetAllReposNames()
    {
        string jsonStr =
            await _backend.InvokeStringArgsApi(
                SNames.RepoService,
                SNames.Methods,
                SNames.GetAllReposNames);
        ItemModel[]? result = JsonSerializer.Deserialize<ItemModel[]>(jsonStr);
        return result ?? Array.Empty<ItemModel>();
    }
    
    public async Task<(bool, ItemModel)> PostParentItem(
        ItemModel inputItem)
    {
        string jsonStr = await _backend.InvokeStringArgsApi(
        
        [SNames.RepoService, SNames.ItemWorker, SNames.PostParentItem,
            inputItem.AdrTuple.Repo,
            inputItem.AdrTuple.Loca,
            inputItem.Type,
            inputItem.Name]);
        
        ItemModel item = JsonSerializer.Deserialize<ItemModel>(jsonStr);
        
        if (item == null) return (false, null);
        
        return (true, item);
    }
    
    public async Task<(bool, ItemModel)> PutItem(
        ItemModel inputItem)
    {
        string jsonStr = await _backend.InvokeStringArgsApi(
        
        [SNames.RepoService, SNames.ItemWorker, SNames.Put,
            inputItem.AdrTuple.Repo,
            inputItem.AdrTuple.Loca,
            inputItem.Type,
            inputItem.Name,
        ""]);
        
        ItemModel item = JsonSerializer.Deserialize<ItemModel>(jsonStr);
        
        if (item == null) return (false, null);
        
        return (true, item);
    }
    
    public async Task<(bool, ItemModel)> GetItem(
        (string Repo, string Loca) adrTuple)
    {
        string jsonStr = await _backend.InvokeStringArgsApi(
            [SNames.RepoService, SNames.ItemWorker, SNames.GetItem,
                adrTuple.Repo,
                adrTuple.Loca]);
        
        ItemModel item = JsonSerializer.Deserialize<ItemModel>(jsonStr);
        
        if (item == null) return (false, null);
        
        return (true, item);
    }

    public async Task<(bool, ItemModel)> GetByGuid(
        string repoName,
        Guid guid)
    {
        string jsonStr = await _backend.InvokeStringArgsApi(
        [SNames.RepoService, SNames.ItemWorker, SNames.GetByGuid,
            repoName,
            guid.ToString()]);
        
        ItemModel item = JsonSerializer.Deserialize<ItemModel>(jsonStr);
        
        if (item == null) return (false, null);
        
        return (true, item);
    }
}
