using SharpApiArgsProg.AAPublic;
using SharpContainerProg.AAPublic;
using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.AAPublic;
using OutBorder01 = SharpFileServiceProg.AAPublic.OutBorder;
using OutBorder02 = SharpRepoServiceProg.AAPublic.OutBorder;
using OutBorder03 = SharpApiArgsProg.AAPublic.OutBorder;

namespace SharpApiArgsProg.Registrations;

internal class OutMockRegistration : RegistrationBase
{
    public override void Registrations()
    {
        // FILE SERVICE
        IFileService file = OutBorder01.FileService();
        OutContainer.RegisterByFunc(
            () => file);
        
        // REPO SERVICE
        IRepoService repo = OutBorder02.RepoService(file);
        OutContainer.RegisterByFunc(
            () => repo);
        
        // STRING ARGS RESOLVER SERVICE
        List<object> servicesList =
        [
            OutContainer.Resolve<IRepoService>()
        ];
        IStringArgsResolverService resolver = OutBorder03
            .StringArgsResolverService(servicesList);
        OutContainer.RegisterByFunc(
            () => resolver);
    }
}
