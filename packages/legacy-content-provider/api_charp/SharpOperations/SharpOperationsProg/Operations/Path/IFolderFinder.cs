namespace SharpOperationsProg.Operations.Path;

public interface IFolderFinder
{
    string FindFolder(
        string searchFolderName,
        string inputFolderPath,
        string expression,
        Type callerObjectType);
}
