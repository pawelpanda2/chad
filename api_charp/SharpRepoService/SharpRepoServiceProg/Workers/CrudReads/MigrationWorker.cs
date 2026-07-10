using System;
using System.Collections.Generic;
using System.IO;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class MigrationWorker
{
    private readonly ConfigWorker _config;
    private readonly PathWorker _path;
    private readonly CustomOperationsService _customOperations;

    public MigrationWorker()
    {
        _customOperations = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        _config = MyBorder.MyContainer.Resolve<ConfigWorker>();
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
    }
    
    public ItemModel GetOnlyItemConfig(
        (string Repo, string Loca) adrTuple,
        bool migrate = true)
    {
        ItemModel item = new();
        GetConfigBeforeRead(adrTuple, out var outConfig);
        item.Settings = outConfig;
        return item;
    }

    public Dictionary<string, object> GetConfigBeforeWrite(
        Dictionary<string, object> config,
        (string Repo, string Loca) adrTuple)
    {
        TryMigrateConfig(config, adrTuple);
        return config;
    }

    public bool GetConfigBeforeRead(
        (string Repo, string Loca) adrTuple,
        out Dictionary<string, object> outConfig,
        bool migrate = true)
    {
        outConfig = _config.GetConfigDictionary(adrTuple);
        var s01 = false;
        if (migrate)
        {
            s01 = TryMigrateConfigAndSave(outConfig, adrTuple);
        }
        return s01;
    }
    
    public Dictionary<string, object> GetConfigBeforeRef(
        (string Repo, string Loca) adrTuple)
    {
        var config = _config.GetConfigDictionary(adrTuple);
        return config;
    }
    
    private bool TryMigrateConfigAndSave(
        Dictionary<string, object> settings,
        (string Repo, string Loca) adrTuple)
    {
        bool wasMigrated = false;
        bool saveNeeded = TryMigrateConfig(settings, adrTuple);
        if (saveNeeded)
        {
            _config.PutConfig(adrTuple, settings);
            wasMigrated = true;
        }
        return wasMigrated;
    }

    private bool TryMigrateConfig(
        Dictionary<string, object> settings,
        (string Repo, string Loca) adrTuple)
    {
        string newAddress = _customOperations.UniAddress
            .CreateAddresFromAdrTuple(adrTuple);
        settings[ConfigKeys.Address] = newAddress;
        bool saveNeeded = false;
        if (!settings.ContainsKey(ConfigKeys.Id))
        {
            settings[ConfigKeys.Id] = Guid.NewGuid().ToString();
            saveNeeded = true;
        }
        if (!settings.ContainsKey(ConfigKeys.Type))
        {
            string type = AssumeType(adrTuple);
            settings[ConfigKeys.Type] = type;
            saveNeeded = true;
        }
        if (!settings.ContainsKey(ConfigKeys.Address)
            || settings[ConfigKeys.Address] != newAddress)
        {
            settings[ConfigKeys.Address] = newAddress;
            saveNeeded = true;
        }
        return saveNeeded;
    }
    
    public string AssumeType(
        (string repo, string loca) adrTuple)
    {
        string contentFilePath = _path.GetBodyPath(adrTuple);
        if (File.Exists(contentFilePath))
        {
            return UniType.Text.ToString();
        }

        return UniType.Folder.ToString();
    }
}
