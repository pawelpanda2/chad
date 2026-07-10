using System.Linq;
using Newtonsoft.Json;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;

namespace SharpRepoServiceProg.Workers.APublic.ItemWorkers;

public partial class ItemWorker
{
    public string PostParentItem(
        string repo,
        string loca,
        string type,
        string name)
    {
        ItemModel item = new();
        (string Repo, string Loca) adrTuple = new(repo, loca);
        bool s01 = _writeMulti.PostItem(ref item, adrTuple, type, name);
        
        if (!s01)
        {
            string json1 = JsonConvert.SerializeObject(item, Formatting.Indented);
            return json1;
        }
        string json2 = JsonConvert.SerializeObject(item, Formatting.Indented);
        return json2;
    }
    
    public string PostByNames(
        string parent,
        string type,
        params  string[] names)
    {
        // parent is item guid or repo name
        // right now only repo name implemented
        
        var parentAdrTuple = (parent, "");
        var lastName = names.Last();
        var previousNames = names[..^1];
        // var names2 = names.Skip(names.Length - 1).ToArray();
        ItemModel item = new();
        bool s01 = false;
        string type2 = UniType.Folder.ToString();
        foreach (var name in previousNames)
        {
            s01 = _writeMulti.PostItem(ref item, parentAdrTuple, type2, name);
            if (!s01) break;
            parentAdrTuple = item.AdrTuple;
        }
        
        if (!s01){ return string.Empty; }
        
        bool s02 = _writeMulti.PostItem(ref item, parentAdrTuple, type, lastName);
        if (!s02){ return string.Empty; }
        
        string jsonString = JsonConvert.SerializeObject(item, Formatting.Indented);
        return jsonString;
    }
    
    // public string GetByNames(
    //     string Repo,
    //     params string[] names)
    // {
    //     var adrTuple = (Repo, "");
    //     // return GetManyItemByName(adrTuple, names.ToList());
    //     adrTuple = _address.GetAdrTupleBySequenceOfNames(adrTuple, names.ToArray());
    //     ItemModel item = new();
    //     bool s01 = _readMulti.GetItem(ref item, adrTuple);
    //     if (s01)
    //     {
    //         string jsonString = JsonConvert.SerializeObject(item, Formatting.Indented);
    //         return jsonString;
    //     }
    //     return string.Empty;
    // }
    //
    // public string GetItemBySeqOfNames(
    //     (string Repo, string Loca) adrTuple,
    //     params string[] names)
    // {
    //     ItemModel item = new();
    //     bool s01 = _readMulti.GetItemBySeqOfNames(ref item, adrTuple, names);
    //     
    //     if (s01)
    //     {
    //         string json = JsonConvert.SerializeObject(item, Formatting.Indented);
    //         return json;
    //     }
    //     return string.Empty;
    // }
}
