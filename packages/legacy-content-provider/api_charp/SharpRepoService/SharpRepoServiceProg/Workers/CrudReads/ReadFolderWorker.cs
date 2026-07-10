using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class ReadFolderWorker : ReadWorkerBase
{
    private readonly UniType _myType = UniType.Folder;
    private bool _isInitialized;
    private ReadFolderWorker _readMulti;
    private GuidWorker _guid;

    // read; body
    public ItemModel GetItemBody(
        (string Repo, string Loca) adrTuple)
    {
        ItemModel item = new();
        string address = _operations.UniAddress
            .CreateAddresFromAdrTuple(adrTuple);
        item.Address = address;
        item.Body = _body.GetBody(adrTuple);
        return item;
    }

    // read; config, body
    public bool IfMineGetItem(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Folder,
        bool addBody = true)
    {
        if (_myType != type) { return false; }
        
        
        // config
        _migrate
            .GetConfigBeforeRead(adrTuple, out var outConfig);
        item.Settings = outConfig;
            

        // body
        item.Body = ListOfIndexesQNames(adrTuple);

        return true;
    }
    
    // read; config, body
    public bool IfMineGetConfig(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Folder)
    {
        if (_myType != type) { return false; }
        
        // config
        _migrate
            .GetConfigBeforeRead(adrTuple, out var outConfig);
        item.Settings = outConfig;

        return true;
    }
    
    // read; config, body
    public bool IfMineGetBody(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Folder,
        bool addBody = true)
    {
        if (_myType != type) { return false; }
        
        // body
        item.Body = ListOfIndexesQNames(adrTuple);

        return true;
    }
    
    public object TryGetConfigValue(
        (string Repo, string Loca) adrTuple,
        string key)
    {
        Dictionary<string, object> dict = _config
            .GetConfigDictionary(adrTuple);
        bool exists = dict.TryGetValue(key, out var value);
        if (exists)
        {
            return value;
        }

        return null;
    }

    public List<string> GetTextLines(
        (string repo, string loca) adrTuple)
    {
        var item = GetItemBody(adrTuple);
        var configLines = item.Body.ToString().Split(_system.NewLine).ToList();
        return configLines;
    }

    // read; config
    public Dictionary<string, object> GetConfigDict(
        (string Repo, string Loca) address,
        params string[] keyArray)
    {
        string text = _config.GetConfigText(address);
        bool success = _yamlOperations
            .TryDeserialize<Dictionary<string, object>>(text, out var configDict);
        Dictionary<string, object> resultDict = new();

        if (!success)
        {
            return resultDict;
        }

        if (keyArray.Length == 0)
        {
            return configDict;
        }

        foreach (var key in keyArray)
        {
            var success2 = configDict.TryGetValue(key, out var resultValue);

            if (!success2)
            {
                resultDict.Add(key, ErrorValue);
                continue;
            }

            resultDict.Add(key, resultValue);
        }

        return resultDict;
    }

    // read; config
    public List<(int, string)> GetIndexesQNames(
        (string Repo, string Loca) adrTuple)
    {
        var items = _readMany
            .ListOfOnlyConfigItems(adrTuple);
        var result = items
            .Select(x => (_operations.UniAddress.GetLastLocaIndex(x.Address), x.Name))
            .ToList();
        return result;
    }

    public Dictionary<string, string> ListOfIndexesQNames(
        (string Repo, string Loca) adrTuple)
    {
        TryInitialize();
        
        List<ItemModel> items = _readMany
            .ListOfOnlyConfigItems(adrTuple);
        var kv = items.Select(x => SelectIndexQName(x))
            .ToList();
        
        Dictionary<string, string> dict = kv
            .OrderBy(x => x.Key)
            .ToDictionary(x => x.Key, x => x.Value);
        return dict;
    }

    private KeyValuePair<string, string> SelectIndexQName(
        ItemModel x)
    {
        int index = _operations.UniAddress
            .GetLastLocaIndex(x.Address);
        string indexString = _operations.Index
            .IndexToString(index);
        Enum.TryParse<UniType>(x.Type, out var uniType);
        KeyValuePair<string, string> indexQName;

        if (uniType == UniType.Ref)
        {
            _guid.UpdateRefItemIfNeeded(ref x);
            string realAddress = x.Settings[ConfigKeys.RefAddress].ToString();
            (string RefRepo, string RefLoca) realAdrTuple = _operations
                .UniAddress.CreateAddressFromString(realAddress);
            ItemModel item = new();
            
            bool s01 = _readMulti.IfMineGetItem(ref item, realAdrTuple);
            indexQName = new(indexString, item.Name);
            return indexQName;
        }
        
        indexQName = new(indexString, x.Name);
        return indexQName;
    }

    // read; directory
    //public Dictionary<string, string> GetSubAddresses2(
    //    (string Repo, string Loca) adrTuple)
    //{
    //    var itemPath = pw.GetItemPath(adrTuple);
    //    var dirs = sw.GetDirectories(itemPath);
    //    var kv = dirs.Select(x => new KeyValuePair<string, string>(adrTuple.Repo, mw.SelectDirToSection(adrTuple.Loca, x))).ToList();
    //    var dict = kv.ToDictionary(x => x.Key, x => x.Value);
    //    return dict;
    //}

    // read; config, 
    public (string, string) GetFolderByName(
        string repo,
        string loca,
        string name)
    {
        (string repo, string loca) adrTuple = (repo, loca);
        IEnumerable<ItemModel> items = _readMany
            .ListOfOnlyConfigItems(adrTuple)
            .Where(x => x.Type == UniType.Folder.ToString());
        ItemModel found = items.SingleOrDefault(x => x.Name == name);
        if (found == default)
        {
            return default;
        }

        int index = _operations.UniAddress
            .GetLastLocaIndex(found.Address);
        string indexString = _operations.Index.IndexToString(index);
        (string indexString, string Name) result = (indexString, found.Name);
        return result;
    }

    // read; config
    public List<string> GetConfigLines(
        (string Repo, string Loca) adrTuple)
        => _config.GetConfigLines(adrTuple);

    // read; config
    public bool TryGetConfigLines(
        (string Repo, string Loca) address,
        out List<string> lines)
        => TryGetConfigLines(address, out lines);

    // read; config
    public object TryGetConfigKey(
        (string Repo, string Loca) address,
        string key)
    {
        try
        {
            var gg = GetConfigKey(address, key);
            return gg;
        }
        catch
        {
            return "";
        }
    }

    // read; config
    public object GetConfigKey(
        (string Repo, string Loca) address,
        string key)
    {
        var text = _config.GetConfigText(address);
        var success = _yamlOperations
            .TryDeserialize<Dictionary<string, object>>(text, out var resultDict);

        if (!success)
        {
            return ErrorValue;
        }

        var success2 = resultDict.TryGetValue(key, out var resultValue);

        if (!success2)
        {
            return ErrorValue;
        }

        return resultValue;
    }

    // read; config
    // public string GetType(
    //     (string repo, string loca) adrTuple)
    // {
    //     var type = GetConfigKey(adrTuple, "type").ToString();
    //     if (type == "Ref")
    //     {
    //         return "Ref";
    //     }
    //
    //     var contentFilePath = _path.GetBodyPath(adrTuple);
    //     if (File.Exists(contentFilePath))
    //     {
    //         return "Text";
    //     }
    //
    //     return "Folder";
    // }

    // read; directory

    public (string, string) GetNextAdrTuple(
        (string Repo, string Loca) parentAdrTuple)
    {
        string newIndexString = GetNextIndex(parentAdrTuple);
        (string, string) newAdrTuple = _operations.Index
            .AdrTupleJoinLoca(parentAdrTuple, newIndexString);
        return newAdrTuple;
    }

    public string GetNextIndex(
        (string Repo, string Loca) adrTuple)
    {
        int lastIndex = GetFolderLastNumber(adrTuple);
        int newIndex = lastIndex + 1;
        string newIndexString = _operations.Index
            .IndexToString(newIndex);
        return newIndexString;
    }

    public int GetFolderLastNumber(
        (string Repo, string Loca) address)
    {
        var directories = _system.GetDirectories(address);
        if (directories.Length == 0)
        {
            return 0;
        }
        
        var numbers = directories
            .Select(x => _operations.Index.StringToIndex(Path.GetFileName(x)))
            .ToList();
        if (numbers.Count != 0)
        {
            return numbers.Max();
        }

        return 0;
    }


    // read; directory
    public List<(string Repo, string Loca)> GetAllRepoAddresses(
        string repoName)
    {
        var adrTuple = (repoName, "");
        var path = _path.GetItemPath(adrTuple);
        var tmp = _operations.File.NewRepoAddressesObtainer().Visit(path);
        var result = tmp
            .Select(x => (adrTuple.Item1, _operations.UniAddress.JoinLoca(adrTuple.Item2, x)))
            .ToList();
        return result;
    }

    // public List<string> GetAllReposNames()
    // {
    //     List<string> repos = _path.GetAllReposPaths()
    //         .Select(x => Path.GetFileName(x))
    //         .ToList();
    //     return repos;
    // }

    public string GetText2(
        (string Repo, string Loca) adrTuple)
        => _body.GetBody(adrTuple);
    
    private ItemModel TrySetAddress(
        ItemModel item,
        (string Repo, string Loca) adrTuple)
    {
        if (string.IsNullOrEmpty(item.Address))
        {
            string address = _operations.UniAddress
                .CreateAddresFromAdrTuple(adrTuple);
            item.Address = address;
        }
        
        return item;
    }
    
    private void TryInitialize()
    {
        if (!_isInitialized)
        {
            _readMulti = MyBorder.MyContainer.Resolve<ReadFolderWorker>();
            _guid = MyBorder.MyContainer.Resolve<GuidWorker>();
            _isInitialized = true;
        }
    }
}
