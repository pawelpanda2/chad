using BackendAdapters.Models;
using BackendAdapters.Names;
using BackendAdapters.Operations;
using BackendAdapters.Workers;
using BlazorApp.Workers;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace BlazorApp.Pages;

public class AddressLoadDecision
{
    private TabIdStorageWorker _tabIdStorageWorker;
    private PageTitleWorker _pageTitleWorker;
    
    private UrlAddressParser _urlParser;
    // private readonly NavigationManager _navigationManager;
    private readonly IJSRuntime _js;
    private readonly List<ItemModel> _allRepoModels;
    private AddressStorageWorker _addressStorageWorker;
    Guid _tabId;
    private readonly Action _stateHasChanged;
    private readonly RepoAdapter _repoAdapter;
    private readonly BackendAdapter _backendAdapter;
    

    public AddressLoadDecision(
        BackendAdapter backendAdapter,
        RepoAdapter repoAdapter,
        IJSRuntime js,
        List<ItemModel> allRepoModels)
    {
        _backendAdapter = backendAdapter;
        _repoAdapter = repoAdapter;
        _js = js;
        _allRepoModels = allRepoModels;
        _tabIdStorageWorker = new TabIdStorageWorker();
        _pageTitleWorker = new PageTitleWorker();
        _urlParser = new UrlAddressParser(repoAdapter);
        _addressStorageWorker = new AddressStorageWorker();
    }
    
    public async Task OnInitializedAsync(string urlAddress,
        ItemModel _item,
        NavigationManager _navigationManager,
        Func<(string Repo, string Loca), Task> ReloadItemByAddress,
        Func<ItemModel, Task> ReloadItemByModel,
        List<ItemModel> allRepoModels)
    {
        // first page load
        bool s1 = IsFirstPageLoad(urlAddress, _item);
        if (s1)
        {
            await OpenFirstRepo(_navigationManager, ReloadItemByAddress);
            return;
        }
        
        (bool s01, ItemModel newItem) =
            await _urlParser.GetItem(urlAddress, allRepoModels);
        
        bool pageReloadNeeded = _urlParser
            .IsPageReloadNeeded(newItem, urlAddress, out string newUrl);
        if (pageReloadNeeded)
        {
            _navigationManager.NavigateTo(urlAddress, forceLoad: false);
            await ReloadItemByModel.Invoke(newItem);
            return;
        }

        bool itemReloadNeeded = _urlParser
            .IsItemReloadNeeded(_item, newItem);
        
        (bool, string) r1 = await _addressStorageWorker.Get(_js, _tabId);
        if (r1.Item1)
        {
            var adrTuple = IFrontendOperations.NoSqlAddress.CreateAdrTupleFromAddress(r1.Item2);
            await ReloadItemByAddress.Invoke(adrTuple);
            return;
        }
        else
        {
            await _addressStorageWorker.Put(_js, _tabId, urlAddress);
        }
        
        if (itemReloadNeeded)
        {
            await ReloadItemByModel.Invoke(newItem);
        }
    }

    private async Task OpenFirstRepo(
        NavigationManager _navigationManager,
        Func<(string Repo, string Loca), Task> ReloadItemByAddress)
    {
        ItemModel? repoItem = _allRepoModels.First();
        string? adr = repoItem.AdrTuple.Repo;
        _navigationManager.NavigateTo(adr, forceLoad: false);
        await ReloadItemByAddress.Invoke(repoItem.AdrTuple);
        return;
    }

    private bool IsFirstPageLoad(
        string urlAddress,
        ItemModel item)
    {
        if (urlAddress == "" && item == null) { return true;}

        return false;
    }
}
