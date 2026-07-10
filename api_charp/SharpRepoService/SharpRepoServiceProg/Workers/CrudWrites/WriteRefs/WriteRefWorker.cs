using System;
using System.Collections.Generic;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteRefs;

internal class WriteRefWorker : WriteWorkerBase
{
    private UniType _myUniType = UniType.Ref;
    private bool _initialized;
    private ReadMultiWorker _readMulti;
    private GuidWorker _guidWorker;

    public bool IfMineParentPost(
        ref ItemModel item,
        string guidStr,
        (string Repo, string Loca) parentAdrTuple,
        UniType uniType)
    {
        if (uniType != _myUniType) { return false; }
        bool s01 = GetRealRepoAndGuid(guidStr, parentAdrTuple, out Guid realGuid, out string realRepoName);
        if (!s01) { return false; }
        IfNotInitialized();

        bool s03 = _guidWorker.GetAdrTupleByGuid(
            realRepoName,
            realGuid,
            out var foundAdrTuple);

        if (!s03)
        {
            return false;
        }
        
        var nextAdrTuple = _readFolder
            .GetNextAdrTuple(parentAdrTuple);
        item = PrepareItem(realGuid, nextAdrTuple, foundAdrTuple);
        Put(item);
        return true; // already existed = false
    }

    private bool GetRealRepoAndGuid(
        string guidStr,
        (string Repo, string Loca) parentAdrTuple,
        out Guid guid,
        out string repoName)
    {
        char splitter = '/';
        guid = Guid.Empty;
        repoName = string.Empty;
        bool s01 = false;
        if (!guidStr.Contains(splitter))
        {
            s01 = Guid.TryParse(guidStr, out guid);
            repoName = parentAdrTuple.Repo;
        }

        if (s01)
        {
            return true;
        }
        
        string[] parts = guidStr.Split(';');
        if (parts.Length != 2)
        {
            return false;
        }

        repoName = parts[0];
        bool s04 = Guid.TryParse(parts[1], out guid);

        if (!s04)
        {
            return false;
        }
        
        return true;
    }

    private ItemModel PrepareItem(
        Guid guid,
        (string Repo, string Loca) adrTuple,
        (string Repo, string Loca) realAdrTuple)
    {
        ItemModel item = new();
        string address = _guidWorker._operations.UniAddress
            .CreateAddresFromAdrTuple(realAdrTuple);

        // config
        Dictionary<string, object> settings = new()
        {
            { ConfigKeys.Id, Guid.NewGuid().ToString() },
            { ConfigKeys.Type, UniType.Ref.ToString() },
            { ConfigKeys.Name, "refName" },
            { ConfigKeys.RefGuid, guid.ToString() },
            { ConfigKeys.RefAddress, address },
        };
        item.Settings = _migrate.GetConfigBeforeWrite(settings, adrTuple);

        return item;
    }

    private ItemModel Put(ItemModel item)
    {
        // directory
        _system.CreateDirectoryIfNotExists(item.AdrTuple);

        // config
        _config.PutConfig(item.AdrTuple, item.Settings);

        return item;
    }
    
    private void IfNotInitialized()
    {
        if (!_initialized)
        {
            _readMulti = MyBorder.MyContainer.Resolve<ReadMultiWorker>();
            _guidWorker = MyBorder.MyContainer.Resolve<GuidWorker>();
        }
    }
}
