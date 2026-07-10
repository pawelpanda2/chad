namespace SharpOperationsProg.AAPublic.Operations;

public interface IUnitItemOperations
{
    public bool PostParentItem<T>(
        ref T item,
        (string Repo, string Loca) adrTuple,
        string type,
        string name) where T : class;

    public bool GetItem<T>(
        ref T item,
        (string Repo, string Loca) adrTuple) where T : class;
    
    bool GetByGuid<T>(
        ref T item,
        string repoName,
        Guid guid) where T : class;
}
