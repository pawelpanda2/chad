using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations.Files;

namespace SharpOperationsProg.AAPublic.Operations;

public interface IRepo
{
    IFileVisit GetNewRecursivelyVisitDirectory();
    IParentVisit GetNewVisitDirectoriesRecursivelyWithParentMemory();
    IRepoAddressesObtainer NewRepoAddressesObtainer();
}