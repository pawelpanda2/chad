using System;
using System.Linq;

namespace SharpRepoServiceProg.Duplications.Operations;

public class UniAddressOperations
{
    private readonly IndexOperations _indexOperations;

    public UniAddressOperations(
        IndexOperations indexOperations)
    {
        _indexOperations = indexOperations;
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
    
    public string CreateAddresFromAdrTuple(
        (string Repo, string Loca) adrTuple)
    {
        if (adrTuple.Loca == string.Empty)
        {
            return adrTuple.Repo;
        }

        string address = adrTuple.Repo + "/" + adrTuple.Loca;
        return address;
    }
    
    public (string Repo, string Loca) CreateAdrTupleFromAddress(string addressString)
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

    public (string Repo, string Loca) MoveOneLocaBack(
        (string Repo, string Loca) adrTuple)
    {
        var address = CreateAddresFromAdrTuple(adrTuple);
        var oneBackAddress = MoveOneLocaBack(address);
        var oneBackAdrTuple = CreateAdrTupleFromAddress(oneBackAddress);
        return oneBackAdrTuple;
    }

    public string MoveOneLocaBack(string address)
    {
        var slashCount = address.Count(x => x == '/');
        if (slashCount == 0)
        {
            return address;
        }

        var splited = address.Split("/").ToList();
        var lastItemIndex = splited.Count - 1;
        splited.RemoveAt(lastItemIndex);
        var newAddress = String.Join('/', splited);

        return newAddress;
    }

    public int GetLastLocaIndex(string addressString)
    {
        var slashCount = addressString.Count(x => x == '/');
        if (slashCount < 1)
        {
            throw new Exception();
        }

        var splited = addressString.Split("/").ToList();
        var lastIndexString = splited.Last();
        var lastIndex = _indexOperations.StringToIndex(lastIndexString);
        return lastIndex;
    }
    
    public (string, string) CreateAddressFromString(string addressString)
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
}