using System.Text.Json;
using SharpApiArgsProg.AAPublic;
using SharpRepoServiceProg.Models;
using SimpleRun;

namespace SimpleRunTests;

[TestClass]
public sealed class Bugs_1
{
    IStringArgsResolverService _argsService;
    
    public Bugs_1()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        _argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();
    }
    
    [TestMethod]
    public void FindRecursively()
    {
        var r1 = _argsService.Invoke(new []
                { "IRepoService", "IItemWorker", "GetByNames", "girls", "all items"});
        
        var r2 = _argsService.Invoke(new[]
            { "IRepoService", "IMethodWorker", "FindRecursively", "girls", "06", "//todo" });
        
        
        ItemModel gg1 =  JsonSerializer.Deserialize<ItemModel>(r1);
        List<ItemModel>? gg2 =  JsonSerializer.Deserialize<List<ItemModel>>(r2);
    }
    
    [TestMethod]
    public void FindRecursively2()
    {
        var r1 = _argsService.Invoke(new[]
        {
            "IRepoService", "IItemWorker", "GetByNames", "girls", "all items"
        });

        var r2 = _argsService.Invoke(new[]
        {
            "IRepoService", "IMethodWorker", "FindRecursively", "girls", "06", "//todo"
        });

        ItemModel gg1 = JsonSerializer.Deserialize<ItemModel>(r1)
                        ?? throw new Exception("Cannot deserialize all girls item.");

        List<ItemModel> gg2 = JsonSerializer.Deserialize<List<ItemModel>>(r2)
                              ?? throw new Exception("Cannot deserialize found todo items.");

        string bodyJson = gg1.Body.ToString()
                          ?? throw new Exception("All girls Body is null.");

        Dictionary<string, string> parentMap =
            JsonSerializer.Deserialize<Dictionary<string, string>>(bodyJson)
            ?? throw new Exception("Cannot deserialize all girls Body as dictionary.");

        HashSet<string> parentKeys = parentMap.Keys.ToHashSet();

        var missingParents = gg2
            .Select(x => x.Address)
            .Select(address => address.Trim('/').Split('/'))
            .Where(parts => parts.Length >= 3)
            .Select(parts => new
            {
                Address = string.Join("/", parts),
                ParentKey = parts[2],
                ParentAddress = $"{parts[0]}/{parts[1]}/{parts[2]}"
            })
            .Where(x => !parentKeys.Contains(x.ParentKey))
            .ToList();

        if (missingParents.Any())
        {
            var msg = string.Join(Environment.NewLine, missingParents.Select(x =>
                $"{x.Address} -> missing parent key: {x.ParentKey}, parent address: {x.ParentAddress}"));

            Assert.Fail("Found todo items with missing parents:" + Environment.NewLine + msg);
        }
    }
}

