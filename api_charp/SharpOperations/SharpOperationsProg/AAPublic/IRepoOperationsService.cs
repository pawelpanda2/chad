using SharpOperationsProg.Operations.UniItem;
using SharpOperationsProg.Operations.UniItemAddress;

namespace SharpOperationsProg.AAPublic;

public interface IRepoOperationsService
{
    public UnitItemOperations Item { get; }
    
    public IUniAddressOperations Address { get; }
}
