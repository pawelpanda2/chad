using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.Operations.Index;
using SharpOperationsProg.Operations.Json;
using SharpOperationsProg.Service;
using SharpRepoServiceProg.AAPublic;

namespace SharpOperationsProg.AAPublic;

public static class OutBorder
{
    public static IOperationsService OperationsService(
        IFileService fileService)
    {
        return new OperationService(fileService);
    }
    
    public static IRepoOperationsService RepoOperationsService(
        IFileService fileService,
        IRepoService repoService)
    {
        var json = new JsonOperations();
        var index = new IndexOperations();
        return new RepoOperationService(fileService, repoService, json, index);
    }
}
