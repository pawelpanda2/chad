using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpRepoServiceProg.Duplications.Operations.Files;

namespace SharpOperationsProg.Operations.Files;

internal class FileWrk : IFileWrk
{
    private readonly IFileService operationsService;

    public FileWrk(IFileService operationsService)
    {
        this.operationsService = operationsService;
    }

    // public IFileVisit GetNewRecursivelyVisitDirectory()
    //     => new VisitDirectoriesRecursively();
    //
    // public IParentVisit GetNewVisitDirectoriesRecursivelyWithParentMemory()
    //     => new VisitDirectoriesRecursivelyWithParentMemory();
    public IFileVisit GetNewRecursivelyVisitDirectory()
    {
        throw new NotImplementedException();
    }

    public IParentVisit GetNewVisitDirectoriesRecursivelyWithParentMemory()
    {
        throw new NotImplementedException();
    }

    public IRepoAddressesObtainer NewRepoAddressesObtainer()
    {
        throw new NotImplementedException();
    }
}