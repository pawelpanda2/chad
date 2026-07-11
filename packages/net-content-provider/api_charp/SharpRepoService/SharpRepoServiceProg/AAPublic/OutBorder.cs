using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Service;

namespace SharpRepoServiceProg.AAPublic;

public class OutBorder
{
    public static IRepoService RepoService(
        IFileService fileService)
    {
        return new RepoService(fileService);
    }
}
