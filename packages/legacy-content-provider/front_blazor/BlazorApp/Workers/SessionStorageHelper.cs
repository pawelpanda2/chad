using Microsoft.JSInterop;

namespace BlazorApp.Workers;

public static class SessionStorageHelper
{
    public static ValueTask SetAsync(this IJSRuntime js, string key, string value)
        => js.InvokeVoidAsync("sessionStorage.setItem", key, value);

    public static ValueTask<string?> GetAsync(this IJSRuntime js, string key)
        => js.InvokeAsync<string?>("sessionStorage.getItem", key);
}
