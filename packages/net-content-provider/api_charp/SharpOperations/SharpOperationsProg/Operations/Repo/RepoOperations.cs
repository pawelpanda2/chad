using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpRepoServiceProg.AAPublic;

namespace SharpOperationsProg.Operations.Repo;

public class RepoOperations
{
    private readonly IRepoService _repo;
    private readonly IOperationsService _operations;

    public RepoOperations(
        IRepoService repo,
        IOperationsService operations)
    {
        _repo = repo;
        _operations = operations;
    }
    
    public bool PostParentItem<T>(
        ref T item,
        (string Repo, string Loca) adrTuple,
        string type,
        string name) where T : class
    {
        string json = _repo.Item
            .PostParentItem(adrTuple.Repo, adrTuple.Loca, type, name);
        bool s01 = _operations.Json.TryDeserializeObject<T>(json,
            out item);
        return s01;
    }
}
