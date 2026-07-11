using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.UniItem;
using SharpOperationsProg.Operations.UniItemAddress;
using SharpRepoServiceProg.AAPublic;

namespace SharpOperationsProg.Service;

internal class RepoOperationService : IRepoOperationsService
{
    private readonly IFileService _fileService;
    private readonly IRepoService _repoService;
    private Lazy<UnitItemOperations> _item;
    private Lazy<IUniAddressOperations> _address;
    
    public UnitItemOperations Item => _item.Value;
    
    public IUniAddressOperations Address => _address.Value;

    public RepoOperationService(
        IFileService fileService,
        IRepoService repoService,
        IJsonOperations jsonOperations,
        IIndexOperations indexOperations)
    {
        _fileService = fileService;
        _repoService = repoService;
        _item = new Lazy<UnitItemOperations>(() =>
            new UnitItemOperations(_repoService, jsonOperations));
        _address = new Lazy<IUniAddressOperations>(() =>
            new UniAddressOperations(_fileService, indexOperations));
    }
}
