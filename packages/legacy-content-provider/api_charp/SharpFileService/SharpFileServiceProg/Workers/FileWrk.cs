using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Recursively;

namespace SharpFileServiceProg.Workers;

internal class FileWrk : IFileWrk
{
    public IFileVisit GetNewRecursivelyVisitDirectory()
        => new VisitDirectoriesRecursively();

    public IParentVisit GetNewVisitDirectoriesRecursivelyWithParentMemory()
        => new VisitDirectoriesRecursivelyWithParentMemory();
}