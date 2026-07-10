using System.Collections.Generic;
using Newtonsoft.Json;
using SharpRepoServiceProg.Models;

namespace SharpRepoServiceProg.Workers.APublic.ItemWorkers;

public partial class ItemWorker
{
    public string Put(
        string repo,
        string loca,
        string type,
        string name,
        string body = "")
    {
        var adrTuple = (repo, loca);
        ItemModel item = new();
        bool s01 = _writeMulti
            .PutItem(ref item, adrTuple, type, name, body);

        string result = JsonConvert.SerializeObject(item, Formatting.Indented);
        return result;
    }
    
    public string PutItem(
        (string repo, string loca) adrTuple,
        string type,
        string name,
        string body = "")
    {
        ItemModel item = new();
        bool s01 = _writeMulti
            .PutItem(ref item, adrTuple, type, name, body);

        string result = JsonConvert.SerializeObject(item, Formatting.Indented);
        return result;
    }
    
    public void PutConfig(
        (string repo, string loca) adrTuple,
        Dictionary<string, object> config)
    {
        _config.PutConfig(adrTuple, config);
    }
}
