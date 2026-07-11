using System;
using SharpRepoServiceProg.Registrations;
using System.Collections.Generic;
using System.Linq;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Duplications.Operations;

namespace SharpRepoServiceProg.Models;

internal class ItemModel
{
    private string address;

    private Dictionary<string, object> settings;

    internal string Name { get; set; }

    internal string Type { get; set; }

    internal string Id { get; set; }

    internal string Address
    {
        get => address;
        set
        {
            address = value;
            CustomOperationsService operationsService = MyBorder.MyContainer.Resolve<CustomOperationsService>();
            (string, string) adrTuple = operationsService.UniAddress.CreateAddressFromString(address);
            AdrTuple = adrTuple;
        }
    }

    internal (string Repo, string Loca) AdrTuple { get; private set; }

    public object Body { get; set; }

    public Dictionary<string, object> Settings
    {
        get => settings;
        set
        {
            settings = value;
            SetIndentificators(settings);
        }
    }

    private void SetIndentificators(Dictionary<string, object> dict)
    {
        var errors = new List<string>();

        string name = TryGetRequiredString(dict, ConfigKeys.Name, errors);
        string id = TryGetRequiredString(dict, ConfigKeys.Id, errors);
        string type = TryGetRequiredString(dict, ConfigKeys.Type, errors);
        string address = TryGetRequiredString(dict, ConfigKeys.Address, errors);

        if (errors.Any())
        {
            throw new InvalidOperationException(
                "Invalid item config. " +
                $"Errors=[{string.Join("; ", errors)}]. " +
                $"Item context: {GetDebugContext(dict)}"
            );
        }

        Name = name;
        Id = id;
        Type = type;
        Address = address;
    }

    private string TryGetRequiredString(
        Dictionary<string, object> dict,
        string key,
        List<string> errors)
    {
        if (dict == null)
        {
            errors.Add("Settings dictionary is null");
            return null;
        }

        if (!dict.TryGetValue(key, out var value))
        {
            errors.Add($"Missing required config key: '{key}'");
            return null;
        }

        if (value == null)
        {
            errors.Add($"Config key '{key}' is null");
            return null;
        }

        string text = value.ToString();

        if (string.IsNullOrWhiteSpace(text))
        {
            errors.Add($"Config key '{key}' is empty");
            return null;
        }

        return text;
    }

    private string GetDebugContext(
        Dictionary<string, object> dict)
    {
        string settingsDump = dict == null
            ? "null"
            : string.Join(", ", dict.Select(kv => $"{kv.Key}='{kv.Value ?? "<null>"}'"));

        return
            $"Name='{Name ?? "<unset>"}', " +
            $"Id='{Id ?? "<unset>"}', " +
            $"Type='{Type ?? "<unset>"}', " +
            $"Address='{Address ?? "<unset>"}', " +
            $"Repo='{AdrTuple.Repo ?? "<unset>"}', " +
            $"Loca='{AdrTuple.Loca ?? "<unset>"}', " +
            $"Settings={{ {settingsDump} }}";
    }
}
