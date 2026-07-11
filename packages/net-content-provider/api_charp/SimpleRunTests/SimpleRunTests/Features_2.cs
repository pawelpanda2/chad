using System.Text.Json;
using SharpApiArgsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.Operations.UniItem;
using SharpOperationsProg.Operations.Yaml;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SimpleRun;

namespace SimpleRunTests;

[TestClass]
public sealed class Features_2
{
    IStringArgsResolverService _argsService;
    private readonly UnitItemOperations _operations;
    private readonly SharpYamlOperations _yaml;
    private readonly CustomOperationsService _customOperations;

    public Features_2()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        _argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();
        _yaml = new SharpYamlOperations();
        _customOperations = new CustomOperationsService();
    }
    
    [TestMethod]
    public void FrindConversation()
    {
        var searchName = "26-05-30_pn_Olia";
        
        string repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
        string[] a1 = new[] { "IRepoService", "IItemWorker", "GetByNames", repoId, "beeper" };
        string r1 = _argsService.Invoke(a1);
        ItemModel? item =  JsonSerializer.Deserialize<ItemModel>(r1);
        
        Dictionary<string, string>? result = JsonSerializer.Deserialize<Dictionary<string, string>>(item.Body.ToString());

        string result3 = string.Empty;
        foreach (KeyValuePair<string, string> tmp in result)
        {
            string mediaAdress = item.Address + "/" + tmp.Key;
            (string Repo, string Loca) adrTuple = _customOperations.UniAddress.CreateAdrTupleFromAddress(mediaAdress);
            string[] a2 = new[] { "IRepoService", "IItemWorker", "GetItem", adrTuple.Repo, adrTuple.Loca };
            string r2 = _argsService.Invoke(a2);
            ItemModel? item2 =  JsonSerializer.Deserialize<ItemModel>(r2);
            Dictionary<string, string>? result2 = JsonSerializer.Deserialize<Dictionary<string, string>>(item2.Body.ToString());

            KeyValuePair<string, string> found = result2.SingleOrDefault(x => x.Value == searchName);
            if (found.Value != null)
            {
                result3 = mediaAdress + "/" + found.Key;
                break;
            }
        }
        
        (string Repo, string Loca) adrTuple3 = _customOperations.UniAddress.CreateAdrTupleFromAddress(result3);
        
        string[] a3 = new[] { "IRepoService", "IItemWorker", "GetItem", repoId, adrTuple3.Loca };
        string r3 = _argsService.Invoke(a3);
    }
    
    [TestMethod]
    public void FindReport()
    {
        var searchName = "26-05-30_pn_Olia";
        
        string repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
        string[] a1 = new[] { "IRepoService", "IItemWorker", "GetByNames", repoId, "reports" };
        string r1 = _argsService.Invoke(a1);
        ItemModel? item =  JsonSerializer.Deserialize<ItemModel>(r1);
        
        Dictionary<string, string>? result = JsonSerializer.Deserialize<Dictionary<string, string>>(item.Body.ToString());

        var result3 = new Dictionary<string, List<ItemModel>>();
        foreach (KeyValuePair<string, string> tmp in result)
        {
            string categoryAddress = item.Address + "/" + tmp.Key;
            (string Repo, string Loca) adrTuple = _customOperations.UniAddress.CreateAdrTupleFromAddress(categoryAddress);
            
            string[] a3 = new[] { "IRepoService", "IMethodWorker", "FindRecursively", adrTuple.Repo, adrTuple.Loca, searchName };
            string r3 = _argsService.Invoke(a3);
            if (!string.IsNullOrEmpty(r3))
            {
                List<ItemModel>? items = JsonSerializer.Deserialize<List<ItemModel>>(r3);
                if (items != null && items.Count > 0)
                {
                    result3.Add(categoryAddress, items);
                }
            }
            
        }
        
    }
    
    [TestMethod]
    public void SaveAiAnswerToMsgWorkout()
    {
        string repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";
        string leadName = "26-05-30_pn_Olia";
        string today = DateTime.Now.ToString("yy-MM-dd"); // np. 26-06-19
        string aiAnswer = "TEST AI ANSWER BODY";

        // 1. Znajdź lead item po nazwie
        string r1 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "GetByNames",
            repoId, "leads", "all items"
        });

        ItemModel allItem = JsonSerializer.Deserialize<ItemModel>(r1)
                             ?? throw new Exception("Cannot deserialize all leads.");

        Dictionary<string, string> leadsMap =
            JsonSerializer.Deserialize<Dictionary<string, string>>(allItem.Body.ToString())
            ?? throw new Exception("Cannot deserialize leads map.");

        var leadPair = leadsMap.Single(x => x.Value == leadName);

        string allLeadsAddress = allItem.Address;
        string leadAddress = $"{allLeadsAddress}/{leadPair.Key}";
        var leadAdr = _customOperations.UniAddress.CreateAdrTupleFromAddress(leadAddress);

        // 2. Znajdź albo utwórz folder "msg workout" w leadzie
        string r2 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "PostParentItem",
            repoId, leadAdr.Loca, "Text", "msg workout"
        });
        
        ItemModel? msgWorkout = JsonSerializer.Deserialize<ItemModel>(r2);
        
        Dictionary<string, string>? childrenOfMsgWorkout = JsonSerializer.Deserialize<Dictionary<string, string>>(msgWorkout.Body.ToString());
        
        string newName = BuildNextAiBotName(today, childrenOfMsgWorkout.Values.ToList());

        var adrTuple = _customOperations.UniAddress.CreateAdrTupleFromAddress(msgWorkout.Address);
        // 4. Utwórz nowy Text item pod msg workout
        string rPost = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "PostParentItem",
            repoId, adrTuple.Loca, "Text", newName
        });

        ItemModel createdItem = JsonSerializer.Deserialize<ItemModel>(rPost)
                                ?? throw new Exception("Cannot create AI answer item.");

        string createdLoca = _customOperations.UniAddress
            .CreateAdrTupleFromAddress(createdItem.Address)
            .Loca;

        // 5. Zapisz odpowiedź AI do body
        string rPut = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "Put",
            repoId, createdLoca, "Text", newName, aiAnswer
        });

        ItemModel savedItem = JsonSerializer.Deserialize<ItemModel>(rPut)
                              ?? throw new Exception("Cannot save AI answer item.");
    }

    private static string BuildNextAiBotName(
        string today,
        List<string> existingNames)
    {
        string baseName = $"{today}; ai bot";

        if (!existingNames.Contains(baseName))
            return baseName;

        for (char c = 'b'; c <= 'z'; c++)
        {
            string candidate = $"{today}{c}; ai bot";

            if (!existingNames.Contains(candidate))
                return candidate;
        }

        throw new Exception($"Too many AI bot items for date {today}.");
    }
}
