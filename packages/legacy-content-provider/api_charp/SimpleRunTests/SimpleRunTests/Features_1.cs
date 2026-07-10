using System.Text.Json;
using SharpApiArgsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.Operations.UniItem;
using SharpOperationsProg.Operations.UniItemAddress;
using SharpOperationsProg.Operations.Yaml;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SimpleRun;

namespace SimpleRunTests;

[TestClass]
public sealed class Features_1
{
    IStringArgsResolverService _argsService;
    private readonly UnitItemOperations _operations;
    private readonly SharpYamlOperations _yaml;
    private readonly CustomOperationsService _customOperations;

    public Features_1()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        _argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();
        _yaml = new SharpYamlOperations();
        _customOperations = new CustomOperationsService();
    }
    
    [TestMethod]
    public void GetAllRepos()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        var argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();

        var args2 = new string[] { "IRepoService", "IMethodWorker", "GetAllReposNames" };
        var result2 = argsService.Invoke(args2);
    }

    [TestMethod]
    public void Read_1()
    {
        var a1 = new[] { "IRepoService", "IItemWorker", "GetByNames", "root", "users", "users-list" };
        var r1 = _argsService.Invoke(a1);
    }
    
    [TestMethod]
    public void FrindConversation()
    {
        var searchName = "26-05-30_pn_Olia";
        
        string repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
        string[] a1 = new[] { "IRepoService", "IItemWorker", "GetByNames", repoId, "beeper" };
        string r1 = _argsService.Invoke(a1);
        ItemModel? item =  JsonSerializer.Deserialize<ItemModel>(r1);

        // KeyValuePair<string, string> found;
        Dictionary<string, string>? result = JsonSerializer.Deserialize<Dictionary<string, string>>(item.Body.ToString());

        var result3 = string.Empty;
        foreach (KeyValuePair<string, string> tmp in result)
        {
            string mediaAdress = item.Address + "/" + tmp.Key;
            var adrTuple = _customOperations.UniAddress.CreateAdrTupleFromAddress(mediaAdress);
            string[] a2 = new[] { "IRepoService", "IItemWorker", "GetItem", adrTuple.Repo, adrTuple.Loca };
            string r2 = _argsService.Invoke(a2);
            ItemModel? item2 =  JsonSerializer.Deserialize<ItemModel>(r2);
            Dictionary<string, string>? result2 = JsonSerializer.Deserialize<Dictionary<string, string>>(item2.Body.ToString());

            var found = result2.SingleOrDefault(x => x.Value == searchName);
            if (found.Value != null)
            {
                result3 = mediaAdress + "/" + found.Key;
                break;
            }
        }
        
        var adrTuple3 = _customOperations.UniAddress.CreateAdrTupleFromAddress(result3);
        
        string[] a3 = new[] { "IRepoService", "IItemWorker", "GetItem", repoId, adrTuple3.Loca };
        string r3 = _argsService.Invoke(a3);
    }

    [TestMethod]
    public void Post_2()
    {
        // public string PostParentItem(
        //     string repo,
        //     string loca,
        //     string type,
        //     string name)
        var rA1 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "PostParentItem", "girls", "06/73", "Text", "status"
        });
    }

    [TestMethod]
    public void Post_1()
    {
        var rA1 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "PostByNames", "kamil_s", "forms", "actions", "260610_221131"
        });
        
        var rB1 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "GetByNames", "kamil_s", "forms"
        });
        
        var rB2 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "GetByNames", "kamil_s", "forms", "actions"
        });
        
        var rB3 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "GetByNames", "kamil_s", "forms", "actions", "260610_221131"
        });

        var guid = rB3;
    }

    [TestMethod]
    public void Put_1()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        IStringArgsResolverService argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();
        
        var rA1 = argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "Put", "kamil_s", "02/01/01", "Text", "260610_221131", "zawartosc body"
        });
        
        // public string Put(
        //     string repo,
        //     string loca,
        //     string type,
        //     string name,
        //     string body = "");
        
        //     "Body" : "",
        //     "Settings" : {
        //         "id" : "e6e187dd-97dd-49c1-8a53-1306b8bd7043",
        //         "type" : "Text",
        //         "name" : "260610_221131",
        //         "address" : "kamil_s/02/01/01"
        //     }
    }
    
    [TestMethod]
    public void FindRecursively()
    {
        var r1 = _argsService.Invoke(new []
                { "IRepoService", "IItemWorker", "GetByNames", "girls", "all items"});
        
        var r2 = _argsService.Invoke(new[]
            { "IRepoService", "IMethodWorker", "FindRecursively", "girls", "06", "//todo" });
        
        
    }
    
    [TestMethod]
    public void GetManyByName()
    {
        var r1 = _argsService.Invoke(new []
            { "IRepoService", "ManyItemsWorker", "GetManyByName", "girls", "06", "status"});

        List<ItemModel> gg2 = JsonSerializer.Deserialize<List<ItemModel>>(r1);
    }
}

