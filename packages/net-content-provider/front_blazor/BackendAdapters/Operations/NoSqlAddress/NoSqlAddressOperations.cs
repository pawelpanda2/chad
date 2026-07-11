using System.Text.RegularExpressions;

namespace BackendAdapters.Operations.NoSqlAddress;

public class NoSqlAddressOperations : INoSqlAddressOperations
{
    public string GetAddressString(
        (string Repo, string Loca) adrTuple,
        string separator = "/")
    {
        if (string.IsNullOrWhiteSpace(adrTuple.Loca))
        {
            return adrTuple.Repo;
        }

        string loca = NormalizeLoca(adrTuple.Loca, separator);

        return adrTuple.Repo + separator + loca;
    }

    private string NormalizeLoca(
        string loca,
        string separator)
    {
        string[] parts = Regex
            .Split(loca, @"[\/\-]+")
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToArray();

        return string.Join(separator, parts);
    }

    public string MoveOneLocaBack(string adrString)
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
    public (string, string) CreateAdrTupleFromAddress(
        string addressString)
    {
        addressString = addressString.Trim('/').Replace("https://", "");
        var index = addressString.IndexOf('/');
        if (!addressString.Contains('/'))
        {
            return (addressString, "");
        }

        string repo = addressString.Substring(0, index);
        string loca = addressString.Substring(index + 1, addressString.Length - index - 1);

        if (loca.StartsWith('/'))
        {
            throw new Exception();
        }

        return (repo, loca);
    }
    
    public (string, string) CreateAddressFromUrlParameter(
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
    public (string, string) JoinIndexWithLoca(
        (string Repo, string Loca) adrTuple,
        int? index)
    {
        if (index == null) return adrTuple;

        string idxString = IFrontendOperations.TwoDigitsStr.FromInt(index);

        var newLoca = JoinLoca(adrTuple.Loca, idxString);
        var newAdrTuple = (adrTuple.Repo, newLoca);
        return newAdrTuple;
    }
    
    public string JoinLoca(string loca01, string loca02)
    {
        if (loca01 == string.Empty)
        {
            return loca02;
        }

        var newLoca = loca01 + "/" + loca02;
        return newLoca;
    }
    
    public string CreateUrl(
        (string Repo, string Loca) adrTuple,
        string baseName)
    {
        //var url = baseAddress;
        var url = baseName + "/";
        if (adrTuple.Loca == string.Empty)
        {
            url += adrTuple.Repo;
            return url;
        }

        string loca = adrTuple.Loca.Replace('/', '-');
        url += adrTuple.Repo + "-" + loca;
        return url;
    }
}
