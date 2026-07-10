using System;
using System.Collections.Generic;
using SharpContainerProg.AAPublic;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.Validation;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;

internal partial class WriteFolderWorker
{
    private ValidationWorker _validation;

    public WriteFolderWorker()
    {
        _validation = MyBorder.MyContainer.Resolve<ValidationWorker>();
    }

    internal bool IfMineParentPost(
        ref ItemModel item,
        string name,
        (string Repo, string Loca) parentAdrTuple,
        UniType uniType)
    {
        if (uniType != _myUniType) { return false; }
        
        // Validate repository structure - check for non-numeric child folders
        IfNotInitialized();
        bool isValid = _validation.ValidateParentBeforeCreateChild(
            parentAdrTuple,
            out string errorMessage,
            out string invalidFolderName,
            out string parentPath);
        
        if (!isValid)
        {
            throw new InvalidOperationException(errorMessage);
        }
        
        bool s01 = _readMulti.GetItemBySeqOfNames(ref item, parentAdrTuple, name);
        if (s01)
        {
            return true; // already existed = true
        }
        var nextAdrTuple = _readFolder.GetNextAdrTuple(parentAdrTuple);
        item = PrepareItem(name, nextAdrTuple);
        Put(item);
        return true; // already existed = false
    }
    
    public bool IfMinePut(
        ref ItemModel item,
        string name,
        (string Repo, string Loca) adrTuple,
        string content,
        UniType uniType = UniType.Folder)
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

        Put(item);
        return true;
    }

    public bool DirectPost(
        ref ItemModel item,
        string name,
        (string Repo, string Loca) adrTuple)
    {
        IfNotInitialized();
        // DirectPost is by adrTyple
        // if exists we change only change the name
        // if not exists we create a new Folder
        
        bool s01 = _readMulti.GetItem(
                ref item,
                adrTuple);

        if (!s01)
        {
            Put(name, adrTuple);
            return true; // new item created = true
        }

        if (s01 && item.Name == name)
        {
            return false; // new item created = false
        }

        if (s01 && item.Name != name)
        {
            var parentAdrTuple = _operations.UniAddress
                 .MoveOneLocaBack(item.AdrTuple);
            ItemModel newItem = new();
            bool s02 = IfMineParentPost(ref newItem, name, parentAdrTuple, UniType.Folder);
            Put(item.Name, newItem.AdrTuple);
            Put(name, adrTuple);
            return true; // new item created = true
        }

        throw new InvalidOperationException();
    }

    private ItemModel PrepareItem(
        string name,
        (string Repo, string Loca) adrTuple)
    {
        var item = new ItemModel();

        // config
        var settings = new Dictionary<string, object>()
        {
            { ConfigKeys.Id, Guid.NewGuid().ToString() },
            { ConfigKeys.Type, UniType.Folder.ToString() },
            { ConfigKeys.Name, name },
        };
        item.Settings = _migrate.GetConfigBeforeWrite(settings, adrTuple);
        return item;
    }
    
    // private void FindInOneBack()
    // {
    // string address = _customOperations.UniAddress.CreateAddresFromAdrTuple(adrTuple);
    // string oneBackAddress = _customOperations.UniAddress
    //     .MoveOneLocaBack(address);
    // (string, string) oneBackAdrTuple = _customOperations.UniAddress.CreateAdrTupleFromAddress(oneBackAddress);
    // (string Repo, string Loca) foundAdrTuple = _address
    //     .GetAdrTupleByName(oneBackAdrTuple, name);
    // }
    
    // private void HiddenSth()
    // {
    // int lastIndex = _readFolder.GetFolderLastNumber(oneBackAdrTuple);
    // int newIndex = lastIndex + 1;
    // string newIndexString = _operations.Index.IndexToString(newIndex);
    //
    // if (adrTuple.Loca == "00" && name == "hidden")
    // {
    //     newIndexString = "00";
    // }
    //
    // var newAdrTuple = _operations.Index.AdrTupleJoinLoca(oneBackAdrTuple, newIndexString);
    // Put(name, newAdrTuple);
    // }
    // private void CreateHidden(
    //     (string Repo, string Loca) adrTuple)
    // {
    //     Put("hidden", adrTuple);
    // }
}
