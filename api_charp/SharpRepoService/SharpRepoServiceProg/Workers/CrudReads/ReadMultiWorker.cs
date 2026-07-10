using System;
using System.Collections.Generic;
using System.Linq;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class ReadMultiWorker : ReadWorkerBase
{
    private readonly ReadFolderWorker _readFolder;
    private readonly ReadTextWorker _readText;
    private readonly ReadRefWorker _readRef;

    public ReadMultiWorker()
    {
        _readFolder = MyBorder.MyContainer.Resolve<ReadFolderWorker>();
        _readText = MyBorder.MyContainer.Resolve<ReadTextWorker>();
        _readRef = MyBorder.MyContainer.Resolve<ReadRefWorker>();
    }

    public bool GetItem(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        string type = null)
    {
        bool exists = false;
        if (type == null)
        {
            exists = _config.ItemExists(adrTuple, out type);
        }

        if (!exists)
        {
            return false;
        }
        
        bool isKnownType = Enum.TryParse<UniType>(type, out var uniType);
        if (!isKnownType)
        {
            return false;
        }
        
        bool s01 = _readFolder.IfMineGetItem(ref item, adrTuple, uniType);
        bool s02 = _readText.IfMineGetItem(ref item, adrTuple, uniType);
        bool s03 = _readRef.IfMineGetItem(ref item, adrTuple, uniType);
        return s01 || s02 || s03;
    }
    
    public ItemModel GetConfigExcludingRef(
        (string Repo, string Loca) adrTuple,
        string type = null)
    {
        if (type == null)
        {
            // todo prevent read of type if not needed!
            type = _config.GetType(adrTuple);
        }
        
        bool isKnownType = Enum.TryParse<UniType>(type, out var uniType);
        ItemModel item = new();
        if (!isKnownType)
        {
            return item;
        }
        
        bool s01 = _readFolder.IfMineGetConfig(ref item, adrTuple, uniType);
        bool s02 = _readText.IfMineGetConfig(ref item, adrTuple, uniType);
        return item;
    }

    public void GetItemConfig(
        ItemModel item,
        (string Repo, string Loca) adrTuple)
    {
        item.Settings = _config
            .GetConfigDictionary(adrTuple);
    }

    public ItemModel GetItemBody(
        (string Repo, string Loca) adrTuple,
        string type = null)
    {
        if (type == null)
        {
            // todo prevent read of type if not needed!
            type = _config.GetType(adrTuple);
        }
        
        bool isKnownType = Enum.TryParse<UniType>(type, out var uniType);
        ItemModel item = new();
        if (!isKnownType)
        {
            return item;
        }
        
        bool s01 = _readFolder.IfMineGetBody(ref item, adrTuple, uniType);
        bool s02 = _readText.IfMineGetBody(ref item, adrTuple, uniType);
        item = _readRef.TryGetItemBody(item, adrTuple, uniType);
        return item;
    }
    
    public bool GetItemBySeqOfNames(
        ref ItemModel item,
        (string Repo, string Loca) inputAdrTuple,
        params string[] names)
    {
        ItemModel foundItem = null;
        bool success = false;
        var adrTuple = inputAdrTuple;
        foreach (var name in names)
        {
            success = GetItemBySequentialOneName(
                adrTuple,
                name,
                out foundItem);

            if (!success)
            {
                return false;
            }
            adrTuple = foundItem.AdrTuple;
        }

        if (success)
        {
            //GetItem(ref item, foundItem.AdrTuple, foundItem.Type);
            item = foundItem;
            item.Body = _readFolder.ListOfIndexesQNames(foundItem.AdrTuple);
            return true;
        }

        return false;
    }
    
    private bool GetItemBySequentialOneName(
        (string Repo, string Loca) adrTuple,
        string name,
        out ItemModel foundItem)
    {
        List<ItemModel> items = _readMany
            .ListOfOnlyConfigItems(adrTuple);
        foundItem = items.SingleOrDefault(x => 
            x.Name.ToString() == name);
        if (foundItem != default)
        {
            return true;
        }

        return false;
    }
}
