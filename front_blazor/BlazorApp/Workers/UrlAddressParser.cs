using System.Text.RegularExpressions;
using BackendAdapters.Models;
using BackendAdapters.Operations;
using BackendAdapters.Workers;

namespace BlazorApp.Workers;

public class UrlAddressParser
{
    private readonly RepoAdapter _repo;

    public UrlAddressParser(
        RepoAdapter repo)
    {
        _repo = repo;
    }
    
    public bool IsItemReloadNeeded(
        ItemModel currentItem,
        ItemModel newItem)
    {
        if (newItem?.AdrTuple == default) { return false; }
        if (currentItem?.AdrTuple != newItem?.AdrTuple) { return true; }
        return false;
    }

    public bool IsPageReloadNeeded(
        ItemModel item,
        string browserCurrentUrl,
        out string newUrl)
    {
        if (item?.AdrTuple == default)
        {
            newUrl = string.Empty;
            return false;
        }
        
        newUrl = IFrontendOperations.NoSqlAddress
            .CreateUrl(item.AdrTuple, "");
        if (newUrl == browserCurrentUrl)
        {
            return false;
        }

        return true;
    }
    
    public async Task<(bool, ItemModel)> GetItem(
        string UrlUniAddress,
        List<ItemModel> allRepoModels)
    {
        ItemModel item = new();
        if (!string.IsNullOrEmpty(UrlUniAddress)
            && (
                UrlUniAddress.EndsWith(".css")
                || UrlUniAddress.EndsWith(".png")))
        {
            return (false, null);
        }
        
        bool s05 = false;
        if (UrlUniAddress == null)
        {
            var firstRepoAdrTyple = await _repo.GetFirstRepo();
            (s05, item) = await _repo.GetItem(firstRepoAdrTyple);
            if (s05) { return (true, item); }
        }

        bool s06 = IsRepo(UrlUniAddress), s07 = false;
        if (s06)
        {
            (string UrlUniAddress, string) adrTyple = (UrlUniAddress, "");
            (s07, item) = await _repo.GetItem(adrTyple);
            if (s07) { return (true, item); }
        }
        
        bool s01 = IsRepoQGuid(UrlUniAddress, out string repoName, out Guid guid),
        s02 = false;
        if (s01)
        {
            var first = allRepoModels.FirstOrDefault(x => x.Name == repoName);
            (s02, item) = await _repo.GetByGuid(first.Id, guid);
            if (s02) { return (true, item); }
        }
        
        bool s03 = IsRepoAddress(UrlUniAddress, out (string, string) adrTuple),
        s04 = false;
        if (s03)
        {
            (s04, item) = await _repo.GetItem(adrTuple);
        }
        
        if (s04)
        {
            return (true, item);
        }
        
        return (false, null);
    }

    private async Task<bool> HandleGuid(
        string repoName,
        Guid guid)
    {
        (bool s01,ItemModel item) = await _repo.GetByGuid(repoName, guid);
        if (!s01)
        {
            return false;
        }

        return true;
    }

    private bool IsRepo(
        string? urlUniAddress)
    {
        if (urlUniAddress.Contains('-') ||
            urlUniAddress.Contains('/') ||
            string.IsNullOrEmpty(urlUniAddress))
        {
            return false;
        }

        return true;
    }

    private bool IsRepoQGuid(
        string? urlUniAddress,
        out string outRepoName,
        out Guid outGuid)
    {
        outRepoName = default;
        outGuid = default;
        string pattern = @"^([A-Za-z0-9]{1,13})-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$";
        Regex regex = new Regex(pattern);
        Match match = regex.Match(urlUniAddress);
        bool correct = match.Success;
        
        if (!correct)
        {
            return false;
        }
        
        string guidStr = match.Groups[2].Value;
        
        bool isGuid = Guid.TryParse(guidStr, out Guid guid);
        if (isGuid)
        {
            outRepoName = match.Groups[1].Value;
            outGuid = guid;
            return true;
        }
        
        return false;
    }

    private bool IsRepoAddress(
        string? urlUniAddress,
        out (string Repo, string Loca) adrTuple)
    {
        adrTuple = default;
        string pattern = @"^([A-Za-z0-9]{1,13})-((0[0-9]|[1-9][0-9]|[1-9][0-9]{2})(-[0-9]{2,3})*)$";
        Regex regex = new Regex(pattern);
        Match match = regex.Match(urlUniAddress);
        bool correct = match.Success;
        if (!match.Success)
        {
            return false;
        }

        string loca = match.Groups[2].Value.Replace('-', '/');
        
        adrTuple = (match.Groups[1].Value, loca);
        return true;
    }
}
