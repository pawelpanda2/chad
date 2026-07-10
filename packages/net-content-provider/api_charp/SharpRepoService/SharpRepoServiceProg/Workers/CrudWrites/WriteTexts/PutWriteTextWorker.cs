using System;
using System.Collections.Generic;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteTexts;

internal partial class WriteTextWorker : WriteWorkerBase
{
    private UniType _myUniType = UniType.Text;
    private ReadMultiWorker _readMulti;
    private bool _initialized;

    public bool IfMinePut(
        ref ItemModel item,
        string name,
        (string Repo, string Loca) adrTuple,
        string content,
        UniType uniType = UniType.Text)
    {
        if (uniType != _myUniType) { return false; }

        // config
        string address = _operations.UniAddress
            .CreateAddresFromAdrTuple(adrTuple);
        item.Settings = new Dictionary<string, object>()
        {
            { ConfigKeys.Id, Guid.NewGuid().ToString() },
            { ConfigKeys.Type, UniType.Text.ToString() },
            { ConfigKeys.Name, name },
            { ConfigKeys.Address, address }
        };

        // body
        item.Body = content;

        Put(item);
        return true;
    }

    private ItemModel Put(
        ItemModel item)
    {
        // directory
        _system.CreateDirectoryIfNotExists(item.AdrTuple);

        // config
        _config.PutConfig(item.AdrTuple, item.Settings);

        // body
        _body.CreateBody(item.AdrTuple, item.Body.ToString());

        return item;
    }

    

    private ItemModel PrepareItem(
        string name,
        (string Repo, string Loca) adrTuple,
        string content)
    {
        var item = new ItemModel();

        // config
        var settings = new Dictionary<string, object>()
        {
            { ConfigKeys.Id, Guid.NewGuid().ToString() },
            { ConfigKeys.Type, UniType.Text.ToString() },
            { ConfigKeys.Name, name },
        };
        item.Settings = _migrate.GetConfigBeforeWrite(settings, adrTuple);

        // body
        item.Body = content;

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
