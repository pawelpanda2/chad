using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.UniItemAddress;

internal class UniAddressOperations : IUniAddressOperations
{
    private readonly IIndexOperations _indexOperations;
    private readonly IFileService _fileService;

    public UniAddressOperations(
        IFileService fileService,
        IIndexOperations indexOperations)
    {
        _indexOperations = indexOperations;
        _fileService = fileService;
    }

    public (string, string) AdrTupleJoinLoca(
        (string Repo, string Loca) adrTuple, string loca)
    {
        if (loca == string.Empty)
        {
            return adrTuple;
        }

        var newLoca = JoinLoca(adrTuple.Loca, loca);
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

    public Uri CreateUriFromAddress((string Repo, string Loca) address, int index)
    {
        var indexString = _indexOperations.IndexToString(index);
        if (address.Loca != string.Empty)
        {
            address = (address.Repo, address.Loca + "/" + indexString);
        }

        if (address.Loca == string.Empty)
        {
            address = (address.Repo, indexString);
        }

        var url = CreateUrlFromAddress(address);
        var url2 = "https://" + url;
        var uri = new Uri(url2);

        if (url.Contains("//"))
        {
            throw new Exception();
        }

        return uri;
    }

    public string CreateUrlFromAddress((string Repo, string Loca) address)
    {
        if (address.Loca == string.Empty)
        {
            return address.Repo;
        }

        var url = address.Repo + "/" + address.Loca;
        return url;
    }
    
    public string CreateUrl(
        (string Repo, string Loca) adrTuple)
    {
        //var url = baseAddress;
        var url = string.Empty;
        if (adrTuple.Loca == string.Empty)
        {
            url += adrTuple.Repo;
            return url;
        }

        string loca = adrTuple.Loca.Replace('/', '-');
        url = adrTuple.Repo + "-" + loca;
        return url;
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
    
    public List<string> GetAllAddressesInOneRepo(
        string path)
    {
        List<string> repoAddressesList = new GetRepoAddresses(_fileService, _indexOperations)
            .Visit(path);
        return repoAddressesList;
    }
}
