using System.Collections.Generic;

namespace SharpRepoServiceProg.Models;

internal class ItemModelOld
{
    public object Body { get; set; }

    public Dictionary<string, object> Settings { get; set; }

    internal string Id { get; set; }

    internal string Type { get; set; }

    internal string Name { get; set; }

    internal (string Repo, string Loca) AdrTuple { get; set; }

    internal string Address
    {
        get
        {
            if (string.IsNullOrEmpty(AdrTuple.Item2))
            {
                return AdrTuple.Item1;
            }

            var result = AdrTuple.Item1 + '/' + AdrTuple.Item2;
            return result;
        }
    }
}