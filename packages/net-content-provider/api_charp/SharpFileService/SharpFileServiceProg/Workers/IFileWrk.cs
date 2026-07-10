using SharpFileServiceProg.AAPublic;

namespace SharpFileServiceProg.Workers;

public interface IFileWrk
{
    IFileVisit GetNewRecursivelyVisitDirectory();
    IParentVisit GetNewVisitDirectoriesRecursivelyWithParentMemory();
}