using Newtonsoft.Json;
using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Yaml;
using SharpOperationsProg.Operations.UniItemAddress;
using SharpRepoServiceProg.AAPublic;

namespace SharpOperationsProg.Operations.UniItem.Extensions;

public static class UnitItemExtensions
{
    public static (string Repo, string Loca) GetAdrTupleByNamesList(
        this IRepoService repoService,
        (string Repo, string Loca) mainAdrTuple,
        List<string> names)
    {
        bool s01 = repoService.Methods.GetAdrTupleByNameList(mainAdrTuple, out var foundAdrTuple, names);
        return foundAdrTuple;
    }
    
    public static (string Repo, string Loca) GetAdrTuple<T>(
        this IRepoService repoService,
        (string Repo, string Loca) mainAdrTuple)
    {
        string name = typeof(T).Name;
        string? json = repoService.Item
            .PostParentItem(mainAdrTuple.Repo, mainAdrTuple.Loca, "Folder", name);
        UniItem? uniItem = JsonConvert.DeserializeObject<UniItem>(json);
        if (uniItem == null) { return default; }
        (string Repo, string Loca) adrTuple = uniItem.AdrTuple;
        return adrTuple;
    }
    public static (string, string) PostItem(
        this IRepoService repoService,
        (string, string) parentAdrTuple,
        string type,
        string name)
    {
        string? json = repoService.Item.PostParentItem(parentAdrTuple.Item1, parentAdrTuple.Item2, type, name);
        UniItem? uniItem = JsonConvert.DeserializeObject<UniItem>(json);
        return uniItem.AdrTuple;
    }
    
    public static (string, string) PostText(
        this IRepoService repoService,
        (string Repo, string Loca) parentAdrTuple,
        string name)
    {
        string? json = repoService.Item.PostParentItem(parentAdrTuple.Repo, parentAdrTuple.Loca, "Text", name);
        UniItem? uniItem = JsonConvert.DeserializeObject<UniItem>(json);
        return uniItem.AdrTuple;
    }
    
    public static (string, string) PostItem(
        this IRepoService repoService,
        (string, string) parentAdrTuple,
        string type,
        string name,
        string body)
    {
        string? json = repoService.Item.PutItem(parentAdrTuple, type, name, body);
        UniItem? uniItem = JsonConvert.DeserializeObject<UniItem>(json);
        return uniItem.AdrTuple;
    }

    public static (string, string) PostFolder(
        this IRepoService repoService,
        (string, string) parentAdrTuple,
        string name)
    {
        var adrTuple = PostItem(repoService, parentAdrTuple, "Folder", name);
        return adrTuple;
    }
    
    public static Dictionary<string, object> GetSettings(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple)
    {
        var json = repoService.Item.GetItem(adrTuple.Repo, adrTuple.Loca);
        var item = JsonConvert.DeserializeObject<UniItem>(json);
        var setting = item.Settings;
        return setting;
    }
    
    public static string PutObjListAsText<T>(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple,
        IEnumerable<T> objList)
    {
        var name = typeof(T).Name;
        var body = IYamlDefaultOperations.Serialize(objList);
        var outAdrTuple = repoService.Item.PutItem(adrTuple, "Text", name, body);
        return body;
    }
    
    public static IEnumerable<T> GetObjListFromText<T>(
        this IRepoService repoService,
        (string, string) typeAdrTuple)
    {
        var objectsList = repoService.GetItemList<T>(typeAdrTuple);
        return objectsList;
    }
    
    public static string GetBody(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple)
    {
        var json = repoService.Item.GetItem(adrTuple.Repo, adrTuple.Loca);
        var item = JsonConvert.DeserializeObject<UniItem>(json);
        return item.Body.ToString();
    }
    
    public static (string, Dictionary<string, object>) GetBodyQSettings(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple)
    {
        var json = repoService.Item.GetItem(adrTuple.Repo, adrTuple.Loca);
        var item = JsonConvert.DeserializeObject<UniItem>(json);
        var bodyQsettings = (item.Body.ToString(), item.Settings);
        return bodyQsettings;
    }
    
    public static (string, string) OverrideTextItem(
        this IRepoService repoService,
        (string, string) adrTuple,
        string name,
        List<string> textLines)
    {
        // todo
        // repoService.Item.DeleteItem(adrTuple);
        var adrTuple02 = repoService.Methods
            .PutText(adrTuple, name, string.Join('\n', textLines));
        return adrTuple02;
    }
    
    public static (string, string) CreateText(
        this IRepoService repoService,
        (string, string) parentAdrTuple,
        string name)
    {
        var adrTuple = PostItem(repoService, parentAdrTuple, "Text", name);
        return adrTuple;
    }

    public static IEnumerable<T> GetItemList<T>(
        this IRepoService repoService,
        string parentAddress,
        string name)
    {
        (string Repo, string Loca) parentAdrTuple = IUniAddressOperations
            .CreateAdrTupleFromAddress(parentAddress);
        bool s01 = repoService.Methods
            .GetAdrTupleByName(parentAdrTuple, name, out var typeAdrTuple);

        if (typeAdrTuple == default)
        {
            repoService.Item
                .PostParentItem(parentAdrTuple.Repo, parentAdrTuple.Loca, "Text", name);
        }

        var objectsList = repoService.GetItemList<T>(typeAdrTuple);
        return objectsList;
    }
    
    public static IEnumerable<T> GetUniItemList<T>(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple)
    {
        string? json = repoService.ManyItems.GetList(adrTuple);
        List<T> itemList = IYamlDefaultOperations.Deserialize<List<T>>(json);
        return itemList;
    }
    
    public static IEnumerable<T> GetItemList<T>(
        this IRepoService repoService,
        (string Repo, string Loca) adrTuple)
    {
        string? jsonString = repoService.Methods.GetItem(adrTuple);
        UniItem? item = JsonConvert.DeserializeObject<UniItem>(jsonString);
        string? body = item.Body.ToString();
        List<T> itemList = IYamlDefaultOperations.Deserialize<List<T>>(body);
        return itemList;
    }
}