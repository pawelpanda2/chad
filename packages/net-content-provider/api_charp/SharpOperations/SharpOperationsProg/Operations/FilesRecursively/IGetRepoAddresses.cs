namespace SharpOperationsProg.Operations.FilesRecursively;

public interface IRepoAddressesObtainer
{
    List<string> Visit(string path);
}