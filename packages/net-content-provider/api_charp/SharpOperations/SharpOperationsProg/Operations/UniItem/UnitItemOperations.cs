using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpRepoServiceProg.AAPublic;

namespace SharpOperationsProg.Operations.UniItem;

public class UnitItemOperations : IUnitItemOperations
{
    private readonly IRepoService _repoService;
    private readonly IJsonOperations _json;

    public UnitItemOperations(
        IRepoService repoService,
        IJsonOperations json)
    {
        _repoService = repoService;
        _json = json;
    }
    
    public bool PostParentItem<T>(
        ref T item,
        (string Repo, string Loca) adrTuple,
        string type,
        string name) where T : class
    {
        string json = _repoService.Item
            .PostParentItem(adrTuple.Repo, adrTuple.Loca, type, name);
        bool s01 = _json.TryDeserializeObject<T>(json,
            out item);
        return s01;
    }
    
    public bool GetItem<T>(
        ref T item,
        (string Repo, string Loca) adrTuple) where T : class
    {
        string json = _repoService.Item
            .GetItem(adrTuple.Repo, adrTuple.Loca);
        bool s01 = _json.TryDeserializeObject<T>(json,
            out item);
        return s01;
    }
    
    public bool GetByGuid<T>(
        ref T item,
        string repoName,
        Guid guid) where T : class
    {
        string json = _repoService.Item
            .GetByGuid(repoName, guid);
        bool s01 = _json.TryDeserializeObject<T>(json,
            out item);
        return s01;
    }
}
