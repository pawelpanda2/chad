using System;
using System.Collections.Generic;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.Caches;
using SharpRepoServiceProg.Workers.CrudWrites;
using SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;
using WriteTextWorker = SharpRepoServiceProg.Workers.CrudWrites.WriteTexts.WriteTextWorker;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class GuidWorker : ReadWorkerBase
{
    private readonly Dictionary<string, PersistencyCache> _repoNameQCacheDict = new();
    private ReadTextWorker _readText;
    private WriteFolderWorker _writeFolder;
    private WriteTextWorker _writeText;
    private ReadManyWorker _readMany;
    private ReadMultiWorker _readMulti;
    private bool _isInitialized;

    public bool GetAdrTupleByGuid(
        string repoName,
        Guid guid,
        out (string, string) outAdrTuple)
    {
        TryInitialize();
        bool found = PrivateGetAdrTupleByGuid(repoName, guid, out var cache, out var foundAdrTuple);
        bool exists = false;
        if (found)
        {
            exists = _config.ItemExists(foundAdrTuple, out var type);
        }
        
        if (exists)
        {
            outAdrTuple = foundAdrTuple;
            return true;
        }
        
        RunCacheEngine(cache);
        _repoNameQCacheDict.Remove(repoName);
        bool success2 = PrivateGetAdrTupleByGuid(repoName, guid, out cache, out foundAdrTuple);
        if (success2)
        {
            outAdrTuple = foundAdrTuple;
            return true;
        }

        outAdrTuple = default;
        return false;
    }

    private bool PrivateGetAdrTupleByGuid(
        string repoName,
        Guid guid,
        out PersistencyCache cache,
        out (string, string) foundAdrTuple)
    {
        cache = GetCache(repoName);
        Dictionary<string, object> dict = cache.Get(guid.ToString());
        if (dict != null)
        {
            foundAdrTuple = GetAdrTupleFromDict(dict);
            return true;
        }

        foundAdrTuple = default;
        return false;
    }

    private (string, string) GetAdrTupleFromDict(
        Dictionary<string, object> dict)
    {
        bool success = dict.TryGetValue("address", out var address);
        if (!success)
        {
            return default;
        }
        
        (string, string) adrTuple = _operations.UniAddress
            .CreateAdrTupleFromAddress(address.ToString());
        return adrTuple;
    }

    private PersistencyCache GetCache(
        string repoName)
    {
        _repoNameQCacheDict.TryGetValue(repoName, out PersistencyCache cache);
        if (cache != null)
        {
            return cache;
        }

        ItemModel item = new();
        (string Repo, string) hiddenAdrTuple = (repoName, "00");
        _writeFolder.DirectPost(ref item,"hidden", hiddenAdrTuple);
        PersistencyCache newCache = new(hiddenAdrTuple);
        _repoNameQCacheDict.Add(repoName, newCache);
        return newCache;
    }

    private (string, string) GetHiddenAdrTuple(
        string repoName)
    {
        return (repoName, "00");
    }
    
    private (string, string) GetCacheAdrTuple(
        string repoName)
    {
        return (repoName, "00");
    }
    
    private void RunCacheEngine(
        PersistencyCache cache)
    {
        var gg = _readMany.GetAllRepoAddresses(cache.CacheAdrTuple.Repo);
        int e = 0;
        PersistencyCache newCache = new(cache.ParentAdrTuple, false);
        for (int i = 0; i < gg.Count; i++)
        {
            var adrTuple = gg[i];
            try
            {
                ItemModel item = _readMulti.GetConfigExcludingRef(adrTuple);
                item.Settings.Add(newCache.KeyString, item.Settings["id"]);
                //item.Settings.Remove("id");
                newCache.Put(item.Id, item.Settings);
            }
            catch (Exception exception)
            {
                e++;
            }
        }

        newCache.Save();
    }

    private void TryInitialize()
    {
        if (!_isInitialized)
        {
            _readText = MyBorder.MyContainer.Resolve<ReadTextWorker>();
            _readMany = MyBorder.MyContainer.Resolve<ReadManyWorker>();
            _writeFolder = MyBorder.MyContainer.Resolve<WriteFolderWorker>();
            _writeText = MyBorder.MyContainer.Resolve<WriteTextWorker>();
            _readMulti = MyBorder.MyContainer.Resolve<ReadMultiWorker>();
            _isInitialized = true;
        }
    }

    public bool UpdateRefItemIfNeeded(
        ref ItemModel item)
    {
        string realAddress = item.Settings[ConfigKeys.RefAddress].ToString();
        (string RefRepo, string RefLoca) realAdrTuple = _operations
            .UniAddress.CreateAddressFromString(realAddress);
        bool exists = _config.ItemExists(realAdrTuple, out var type);
        if (exists)
        {
            return false;
        }

        string guidStr = item.Settings[ConfigKeys.RefGuid].ToString();
        Guid guid = Guid.Parse(guidStr);
        GetAdrTupleByGuid(item.AdrTuple.Repo, guid, out var outAdrTuple);
        string realAddress2 = _operations
            .UniAddress.CreateAddresFromAdrTuple(outAdrTuple);
        item.Settings[ConfigKeys.RefAddress] = realAddress2;
        return true;
    }
}
