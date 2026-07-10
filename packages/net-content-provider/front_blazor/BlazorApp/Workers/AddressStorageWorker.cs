using Microsoft.JSInterop;

namespace BlazorApp.Workers;

public class AddressStorageWorker
{
    private readonly string _prefix = "address-";

    public async Task<(bool, string)> Get(
        IJSRuntime js,
        Guid tabId)
    {
        (bool, string) result = await LoadVariable(js, tabId);
        return result;
    }

    public async Task Put(
        IJSRuntime js,
        Guid tabId,
        string address)
    {
        await SaveVariable(js, tabId, address);
    }

    private async Task SaveVariable(
        IJSRuntime js,
        Guid tabId,
        string address)
    {
        string name = _prefix + tabId;
        await js.SetAsync(name, address);
    }

    private async Task<(bool, string)> LoadVariable(
        IJSRuntime js,
        Guid tabId)
    {
        string name = _prefix + tabId;
        string? address = await js.GetAsync(name);
        if (string.IsNullOrEmpty(address) || address == "null")
            return (false, "");
        return (true, address);
    }
}
