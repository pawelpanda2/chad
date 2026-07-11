using SharpApiArgsProg.AAPublic;
using SharpContainerApi.AA_public;
using SharpContainerProg.AAPublic;
using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;
using OutBorder1 = SharpOperationsProg.AAPublic.OutBorder;
using OutBorder3 = SharpRepoServiceProg.AAPublic.OutBorder;
using OutBorder4 = SharpApiArgsProg.AAPublic.OutBorder;

namespace SimpleRun;

public class DefaultRegistration : RegistrationBase
{
    public Dictionary<string, object> SettingsDict { get; set; }
    public IFileService FileService { get; set; }
    public IOperationsService OperationsService { get; set; }
    public override void Registrations()
    {
        // FILE-MODULE 
        OutContainer.RegisterByFunc<IFileService>(
            () => FileService);
        
        // OPERATIONS-MODULE
        OutContainer.RegisterByFunc<IOperationsService>(
            () => OperationsService);

        // BACKEND MODULE - RepoService
        IRepoService repo = OutBorder3.RepoService(FileService);
        OutContainer.RegisterByFunc<IFileService, IRepoService>(
            x => repo,
            () => FileService,
            0,
            InitGroupsFromSearchPaths);

        // MODULE SERVICE
        IRepoOperationsService repoOp = OutBorder1.RepoOperationsService(
            FileService,
            repo);
        OutContainer.RegisterByFunc<IRepoOperationsService>( 
            () => repoOp);
        
        //
        var list = new List<object>(){repo};
        IStringArgsResolverService args = OutBorder4.StringArgsResolverService(list);
        OutContainer.RegisterByFunc<IStringArgsResolverService>( 
            () => args);
        
    }
    
    
    private void InitGroupsFromSearchPaths()
    {
        IRepoService repoService = OutContainer.Resolve<IRepoService>();
        //ConfigService.Prepare(SettingsDict);
        //List<string> searchPaths = ConfigService.GetRepoSearchPaths();

        string[] searchPaths = MyBorder.OutContainer
            .ConfigurationManager
            .GetSection(ConfigNames.NoSqlRepoSearchPaths)
            .Get<string[]>();

        repoService.InitGroupsFromSearchPaths(searchPaths.ToList());
    }
}
