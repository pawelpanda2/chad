using System.Text.Json;
using SharpApiArgsProg.AAPublic;
using SharpOperationsProg.Operations.UniItem;
using SharpOperationsProg.Operations.Yaml;
using SharpRepoServiceProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Workers.APublic;
using SimpleRun;
using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace SimpleRunTests;

[TestClass]
public sealed class Features_3
{
    IStringArgsResolverService _argsService;
    private readonly UnitItemOperations _operations;
    private readonly SharpYamlOperations _yaml;
    private readonly CustomOperationsService _customOperations;

    public Features_3()
    {
        DefaultPreparer preparer = new();
        preparer.Prepare();
        _argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();
        _yaml = new SharpYamlOperations();
        _customOperations = new CustomOperationsService();
    }
    
    [TestMethod]
    public void Many_GetManyByName()
    {
        string repoId = "21d11bdc-f1f4-44d1-b61a-3fa6b039c641";

        string r1 = _argsService.Invoke(new[]
        {
            nameof(IRepoService), nameof(IItemWorker), nameof(IItemWorker.PostByNames),
            repoId, "Folder", "leads", "all items"
        });
        ItemModel? allItems = JsonSerializer.Deserialize<ItemModel>(r1);
        
        string r2 = _argsService.Invoke(new[]
        {
            nameof(IRepoService), nameof(IManyItemsWorker), nameof(IManyItemsWorker.GetManyByName),
            repoId, allItems.AdrTuple.Loca, "status"
        });
        
        List<ItemModel> statuses = JsonSerializer.Deserialize<List<ItemModel>>(r2);

        
        var deserializer = new DeserializerBuilder()
            .WithNamingConvention(HyphenatedNamingConvention.Instance)
            .IgnoreUnmatchedProperties()
            .Build();

        List<StatusWithSettings> parsedStatuses = statuses
            .Select(item => new StatusWithSettings
            {
                Settings = item.Settings,
                Status = deserializer.Deserialize<Status>(item.Body?.ToString() ?? "")
            })
            .ToList();
    }
    
    
    public class Status
    {
        public string? City { get; set; }
        public bool OnlyFriends { get; set; }
        public bool HerFirstMsg { get; set; }
        public bool YourFirstMessage { get; set; }
        public string? WritingDeadline { get; set; }
        public int PriorityToday { get; set; }
    }
    
    public class StatusWithSettings
    {
        public Dictionary<string, object>? Settings { get; set; }

        public Status Status { get; set; } = null!;
    }
}
