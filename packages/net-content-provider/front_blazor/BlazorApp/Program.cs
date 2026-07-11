using BackendAdapters.Workers;
using BlazorApp;
using BlazorApp.Services;
using Blazored.LocalStorage;
using Microsoft.AspNetCore.Components.Authorization;
using Microsoft.AspNetCore.Components.Web;
using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using BlazorApp.Models;
using BlazorApp.Workers;

WebAssemblyHostBuilder builder = WebAssemblyHostBuilder.CreateDefault(args);
builder.RootComponents.Add<App>("#app");
builder.RootComponents.Add<HeadOutlet>("head::after");

// Register DevLogService as singleton for global logging
builder.Services.AddSingleton<DevLogService>();

// Register BackendErrorFormatter as singleton (stateless service)
builder.Services.AddSingleton<BackendErrorFormatter>();

string GetApiUrl()
{
    string? cpApiUrl1 = Environment.GetEnvironmentVariable(ApiNames.ContentProviderApiUrl);
    string? cpApiUrl2 = builder.Configuration[ApiNames.ContentProviderApiUrl];
    StaticOkAndError.Ok("env;" + ApiNames.ContentProviderApiUrl + ": " + cpApiUrl1);
    StaticOkAndError.Ok("conf;" + ApiNames.ContentProviderApiUrl + ": " + cpApiUrl2);
    
    // Log to console for debugging
    Console.WriteLine($"[Program] Environment API URL ({ApiNames.ContentProviderApiUrl}): {cpApiUrl1}");
    Console.WriteLine($"[Program] Configuration API URL ({ApiNames.ContentProviderApiUrl}): {cpApiUrl2}");
    
    if (!string.IsNullOrEmpty(cpApiUrl1))
    {
        Console.WriteLine($"[Program] Using Environment API URL: {cpApiUrl1}");
        return cpApiUrl1;
    }
    if (!string.IsNullOrEmpty(cpApiUrl2))
    {
        Console.WriteLine($"[Program] Using Configuration API URL: {cpApiUrl2}");
        return cpApiUrl2;
    }

    Console.WriteLine($"[Program] ERROR: No API URL configured!");
    Console.WriteLine($"[Program] Checked Environment variable: {ApiNames.ContentProviderApiUrl}");
    Console.WriteLine($"[Program] Checked Configuration key: {ApiNames.ContentProviderApiUrl}");
    Console.WriteLine($"[Program] Available config keys: {string.Join(", ", builder.Configuration.AsEnumerable().Select(kvp => kvp.Key))}");
    
    throw new InvalidOperationException(
        $"No API URL configured. Expected environment variable or config key: {ApiNames.ContentProviderApiUrl}");
}

builder.Services.AddScoped(_ =>
{
    string apiUrl = GetApiUrl();
    Console.WriteLine($"[Program] Creating HttpClient with BaseAddress: {apiUrl}");
    HttpClient client = new HttpClient()
    {
        BaseAddress = new Uri(apiUrl)
    };
    return client;
});

builder.Services.AddScoped(sp =>
{
    var httpClient = sp.GetRequiredService<HttpClient>();
    var errorLogger = sp.GetRequiredService<DevLogService>();
    return new BackendAdapter(httpClient, errorLogger);
});

builder.Services.AddScoped(sp =>
{
    BackendAdapter backend = sp.GetRequiredService<BackendAdapter>();
    return new RepoAdapter(backend);
});

builder.Services.AddScoped(sp =>
{
    BackendAdapter backend = sp.GetRequiredService<BackendAdapter>();
    return new ButtonActionsAdapter(backend);
});

builder.Services.AddScoped(sp =>
{
    // var httpClient = sp.GetRequiredService<HttpClient>();
    return new PluginAdapter();
});

builder.Services.AddScoped(sp =>
{
    // var httpClient = sp.GetRequiredService<HttpClient>();
    return new AddressCheck();
});

builder.Services.AddCascadingAuthenticationState();
builder.Services.AddAuthorizationCore();
builder.Services.AddScoped<AuthenticationStateProvider, CustomAuthStateProvider>();
builder.Services.AddBlazoredLocalStorage();

// Initialize DevLogService with configuration info after build
var app = builder.Build();

var devLogService = app.Services.GetRequiredService<DevLogService>();
devLogService.ContentProviderApiUrl = builder.Configuration[ApiNames.ContentProviderApiUrl] 
    ?? Environment.GetEnvironmentVariable(ApiNames.ContentProviderApiUrl) 
    ?? "(not configured)";
devLogService.IsAuthDisabled = true; // Auth is currently disabled for dev mode
devLogService.BackendAdapterUrl = devLogService.ContentProviderApiUrl + "/invoke";

Console.WriteLine($"[Program] DevLogService initialized");
Console.WriteLine($"[Program] ContentProviderApiUrl: {devLogService.ContentProviderApiUrl}");
Console.WriteLine($"[Program] BackendAdapterUrl: {devLogService.BackendAdapterUrl}");
Console.WriteLine($"[Program] IsAuthDisabled: {devLogService.IsAuthDisabled}");

devLogService.LogInfo("Program", "Application starting up", 
    $"API URL: {devLogService.ContentProviderApiUrl}");

await app.RunAsync();