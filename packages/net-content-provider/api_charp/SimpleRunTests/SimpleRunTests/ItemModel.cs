using SharpRepoServiceProg.Registrations;
using System.Collections.Generic;
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
            CustomOperationsService operationsService = new CustomOperationsService();
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

    private void SetIndentificators(
        Dictionary<string, object> dict)
    {
        Name = dict[ConfigKeys.Name].ToString();
        Id = dict[ConfigKeys.Id].ToString();
        Type = dict[ConfigKeys.Type].ToString();
        Address = dict[ConfigKeys.Address].ToString();
    }
}
