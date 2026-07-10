using System;
using System.Collections.Generic;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;

internal partial class WriteFolderWorker : WriteWorkerBase
{
    private UniType _myUniType = UniType.Folder;
    private bool _initialized;
    private ReadMultiWorker _readMulti;

    public ItemModel Put(
        string name,
        (string Repo, string Loca) adrTuple)
    {
        ItemModel item = new();

        // config
        string address = _operations.UniAddress.CreateAddresFromAdrTuple(adrTuple);
        item.Settings = new Dictionary<string, object>()
        {
            { ConfigKeys.Id, Guid.NewGuid().ToString() },
            { ConfigKeys.Type, UniType.Folder.ToString() },
            { ConfigKeys.Name, name },
            { ConfigKeys.Address, address },
        };
        
        Put(item);
        return item;
    }
    
    private ItemModel Put(
        ItemModel item)
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
        }
    }
}
