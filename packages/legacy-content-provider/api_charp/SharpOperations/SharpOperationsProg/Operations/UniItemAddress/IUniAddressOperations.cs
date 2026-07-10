namespace SharpOperationsProg.Operations.UniItemAddress;

public interface IUniAddressOperations
{
    public string CreateUrl(
        (string Repo, string Loca) adrTuple);
    public string JoinLoca(string loca01, string loca02);
    public (string, string) AdrTupleJoinLoca((string Repo, string Loca) adrTuple, string loca);
    //(string, string) CreateAddressFromString(string addressString);
    Uri CreateUriFromAddress((string Repo, string Loca) address, int index);
    string CreateUrlFromAddress((string Repo, string Loca) address);
    int GetLastLocaIndex(string addressString);
    
    static string GetAddressString((string, string) adrTuple)
    {
        if (string.IsNullOrEmpty(adrTuple.Item2))
        {
            return adrTuple.Item1;
        }

        var address = adrTuple.Item1 + "/" + adrTuple.Item2;
        return address;
    }

    static string MoveOneLocaBack(string adrString)
    {
        var slashCount = adrString.Count(x => x == '/');
        if (slashCount == 0)
        {
            return adrString;
        }

        var splited = adrString.Split("/").ToList();
        var lastItemIndex = splited.Count - 1;
        splited.RemoveAt(lastItemIndex);
        var newAddress = String.Join('/', splited);

        return newAddress;
    }
    static (string, string) CreateAdrTupleFromAddress(string addressString)
    {
        addressString = addressString.Trim('/').Replace("https://", "");
        var index = addressString.IndexOf('/');
        if (!addressString.Contains('/'))
        {
            return (addressString, "");
        }

        var repo = addressString.Substring(0, index);
        var loca = addressString.Substring(index + 1, addressString.Length - index - 1);

        if (loca.StartsWith('/'))
        {
            throw new Exception();
        }

        return (repo, loca);
    }
    
    static (string, string) CreateAddressFromUrlParameter(
        string addressString)
    {
        var spliter = '-';
        if (!addressString.Contains(spliter))
        {
            return (addressString, "");
        }
        
        addressString = addressString.Trim(spliter);
        int index = addressString.IndexOf(spliter);

        string repo = addressString.Substring(0, index);
        string loca = addressString.Substring(index + 1, addressString.Length - index - 1);

        if (!loca.Contains(spliter))
        {
            return (repo, loca);
        }
        
        var newLoca = loca.Replace(spliter, '/');
        return (repo, newLoca);
    }

    public List<string> GetAllAddressesInOneRepo(string path);
}
