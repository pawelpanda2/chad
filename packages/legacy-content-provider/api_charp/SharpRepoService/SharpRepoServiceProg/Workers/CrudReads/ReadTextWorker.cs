using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class ReadTextWorker : ReadWorkerBase
{
    private readonly UniType _myType = UniType.Text;
    
    // 01; TryGetItem; read; config, body
    public bool IfMineGetItem(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Text)
    {
        if (_myType != type) { return false; }
        
        // config
        _migrate
            .GetConfigBeforeRead(adrTuple, out var outConfig);
        item.Settings = outConfig;

        // body
        item.Body = _body.GetBody(adrTuple);

        return true;
    }
    
    // 02; TryGetItem; read; config, body
    public bool IfMineGetBody(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Text)
    {
        if (_myType != type) { return false; }
        
        // body
        item.Body = _body.GetBody(adrTuple);
        
        return true;
    }
    
    public bool IfMineGetConfig(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        UniType type = UniType.Text)
    {
        if (_myType != type) { return false; }
        
        // config
        _migrate
            .GetConfigBeforeRead(adrTuple, out var outConfig);
        item.Settings = outConfig;

        return true;
    }

    // 02; GetItemBody; read; body
    // public ItemModel GetItemBody(
    //     (string Repo, string Loca) adrTuple)
    // {
    //     ItemModel item = CreateNewWithAddress(adrTuple);
    //     item.Body = _body.GetBody(adrTuple);
    //     return item;
    // }

    // read; config, body
    public List<string> GetManyText(
        (string Repo, string Loca) adrTuple)
    {
        List<ItemModel> items = _readMany.GetListOfItems(adrTuple);
        List<string> contentsList = new();

        foreach (var item in items)
        {
            if (item.Type == _myType.ToString())
            {
                contentsList.Add(item.Body.ToString());
            }
        }

        return contentsList;
    }

    // read; config
    public List<string> GetManyTextByNames(
        (string Repo, string Loca) adrTuple,
        params string[] names)
    {
        bool s01 = _address
            .GetAdrTupleBySequenceOfNames(adrTuple, out var newAdrTuple, names);
        if (!s01)
        {
            return new List<string>();
        }
        List<string> contentsList = GetManyText(newAdrTuple);

        return contentsList;
    }

    // read; config
    public Dictionary<string, object> GetConfigDict(
        (string Repo, string Loca) address,
        params string[] keyArray)
    {
        var text = _config.GetConfigText(address);
        var success = _yamlOperations
            .TryDeserialize<Dictionary<string, object>>(text, out var configDict);
        var resultDict = new Dictionary<string, object>();

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
        var items = GetItemConfigList(adrTuple);
        var result = items
            .Select(x => (_operations.UniAddress.GetLastLocaIndex(x.Address), x.Name))
            .ToList();
        return result;
    }

    public Dictionary<string, string> GetIndexesQNames2(
        (string Repo, string Loca) adrTuple)
    {
        var w1 = _operations.UniAddress;
        var w2 = _operations.Index;

        var items = GetItemConfigList(adrTuple);
        var kv = items
            .Select(x => new KeyValuePair<string, string>(w2.IndexToString(w1.GetLastLocaIndex(x.Address)), x.Name));
            
        var dict = kv
            .OrderBy(x => x.Key)
            .ToDictionary(x => x.Key, x => x.Value);
        return dict;
    }

    // read; config
    public List<ItemModel> GetItemConfigList(
        (string Repo, string Loca) adrTuple)
    {
        var adrTupleList = GetSubAddresses(adrTuple);
        var items = new List<ItemModel>();
        foreach (var adradrTuple in adrTupleList)
        {
            if (IsSpecialFolder(adradrTuple))
            {
                continue;
            }
            var item = _migrate
                .GetOnlyItemConfig(adradrTuple);
            items.Add(item);
        }

        return items;
    }

    public bool IsSpecialFolder((string, string) adr)
    {
        var special = new List<string> { ".git" };
        if (special.Any(x => x == adr.Item1) ||
            special.Any(x => x == adr.Item2))
        {
            return true;
        }
        
        return false;
    }

    // read; config, 
    public (string, string) GetFolderByName(
        string repo,
        string loca,
        string name)
    {
        var adrTuple = (repo, loca);
        var items = GetItemConfigList(adrTuple)
            .Where(x => x.Type == UniType.Folder.ToString());
        var found = items.SingleOrDefault(x => x.Name == name);
        if (found == default)
        {
            return default;
        }

        var index = _operations.UniAddress
            .GetLastLocaIndex(found.Address);
        var indexString = _operations.Index.IndexToString(index);
        var result = (indexString, found.Name);
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
    public string GetType(
        (string repo, string loca) adrTuple)
    {
        var type = GetConfigKey(adrTuple, "type").ToString();
        if (type == "RefText")
        {
            return "RefText";
        }

        var contentFilePath = _path.GetBodyPath(adrTuple);
        if (File.Exists(contentFilePath))
        {
            return "Text";
        }

        return "Folder";
    }

    // read; config
    

    // read; directory
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
    public List<(string, string)> GetSubAddresses(
        (string Repo, string Loca) adrTuple)
    {
        var itemPath = _path.GetItemPath(adrTuple);
        var dirs = _system.GetDirectories(itemPath);
        var subAddresses = dirs.Select(x => (adrTuple.Repo, _memory.SelectDirToSection(adrTuple.Loca, x))).ToList();
        return subAddresses;
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

    public List<string> GetAllReposNames()
    {
        List<string> repos = _path.GetAllReposPaths()
            .Select(x => Path.GetFileName(x))
            .ToList();
        return repos;
    }

    // todo
    public List<string> GetAllRepoAddresses()
    {
        throw new Exception();

        var repos = _path.GetAllReposPaths()
            .Select(x => Path.GetFileName(x)).ToList();
        return repos;
    }

    public string GetText2(
        (string Repo, string Loca) adrTuple)
        => _body.GetBody(adrTuple);
    
    private ItemModel CreateNewWithAddress(
        (string Repo, string Loca) adrTuple)
    {
        ItemModel item = new();
        string address = _operations.UniAddress
            .CreateAddresFromAdrTuple(adrTuple);
        item.Address = address;
        return item;
    }
    
    // public List<string> GetTextLines(
    //     (string repo, string loca) adrTuple)
    // {
    //     var item = GetItemBody(adrTuple);
    //     var configLines = item.Body.ToString().Split(_sw.NewLine).ToList();
    //     return configLines;
    // }
}
