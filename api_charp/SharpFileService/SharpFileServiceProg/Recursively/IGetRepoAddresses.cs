namespace SharpFileServiceProg.Recursively;

public interface IRepoAddressesObtainer
{
    List<string> Visit(string path);
}