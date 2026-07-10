using BackendAdapters.Operations;

namespace BackendAdapters.Models;

public class ItemModel
{
    private string address;

    private Dictionary<string, object> settings;

    public string Name { get; set; }
    public string Type { get; set; }
    public string Id { get; set; }

    public string Address
    {
        get => address;
        set
        {
            address = value;
            (string, string) adrTuple = IFrontendOperations.NoSqlAddress
                .CreateAdrTupleFromAddress(address);
            AdrTuple = adrTuple;
        }
    }

    public (string Repo, string Loca) AdrTuple { get; set; }

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
