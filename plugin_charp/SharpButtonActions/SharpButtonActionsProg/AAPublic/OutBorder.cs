using SharpButtonActionsProg.Services;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;

namespace SharpButtonActionsProg.AAPublic;

public static class OutBorder
{
    public static IMainButtonActionsService MainButtonActionsService(
        IOperationsService operationsService,
        IRepoService repoService)
    {
        return new MainButtonActionsService(
            operationsService,
            repoService);
    }
}
