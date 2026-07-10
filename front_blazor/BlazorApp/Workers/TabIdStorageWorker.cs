using Microsoft.JSInterop;

namespace BlazorApp.Workers;

public class TabIdStorageWorker
{
    private Guid _tabId = Guid.Empty;

    public async Task<Guid> Get(IJSRuntime js)
    {
        if (_tabId != Guid.Empty)
            return _tabId;
        
        string result = await js.InvokeAsync<string>("eval", @"
            (function() {
                function fallback() {
                    return ([1e7]+-1e3+-4e3+-8e3+-1e11)
                           .replace(/[018]/g, c =>
                               (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c/4).toString(16)
                           );
                }

                const id = window.name 
                    || (typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : fallback());

                window.name = id;
                return id;
            })()
        ");

        Guid.TryParse(result, out _tabId);
        return _tabId;
    }
}
