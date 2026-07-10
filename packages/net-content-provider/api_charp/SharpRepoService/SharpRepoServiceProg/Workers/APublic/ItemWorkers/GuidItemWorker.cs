using System;
using Newtonsoft.Json;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Workers.CrudReads;

namespace SharpRepoServiceProg.Workers.APublic.ItemWorkers;

public partial class ItemWorker
{
    private readonly GuidWorker _guid;
    
    public string GetByGuid(
        string repoName,
        Guid guid)
    {
        bool s01 = _guid
            .GetAdrTupleByGuid(repoName, guid, out var adrTuple);
        if (!s01)
        {
            return string.Empty;
        }
        
        ItemModel item = new();
        bool s02 = _readMulti.GetItem(ref item, adrTuple);
        if (!s02)
        {
            return string.Empty;
        }
        
        string result = JsonConvert.SerializeObject(item, Formatting.Indented);
        return result;
    }
}
