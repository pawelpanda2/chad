using System;
using System.Collections.Generic;

namespace SharpRepoServiceProg.Workers.Caches;

public interface IPersistencyCache
{
    (string Repo, string Loca) CacheAdrTuple { get; }
    (string Repo, string Loca) ParentAdrTuple { get; }
    int Count();
    Dictionary<string, object> Get(string key);
    List<Dictionary<string, object>> GetAll();
    bool PutQSave(string mainKeyString, Dictionary<string, object> value);
    bool PutQSave(string mainKeyString, KeyValuePair<string, object> keyValue);
    bool Patch(string mainKey, Action<Dictionary<string, object>> action);
}
