using SharpOperationsProg.Operations.Path;

namespace SharpOperationsProg.AAPublic.Operations;

public interface IBackendOperations
{
    public static IFolderFinder FolderFinder = new FolderFinder();
}
