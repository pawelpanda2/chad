using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Registrations;

namespace SharpRepoServiceProg.Duplications.Operations.Files;

public class FileOperations
{
    public IRepoAddressesObtainer NewRepoAddressesObtainer()
    {
        IFileService fileService = MyBorder.OutContainer.Resolve<IFileService>();
        CustomOperationsService customOperationsService = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        GetRepoAddresses obtainer =  new (fileService, customOperationsService);
        return obtainer;
    }
}