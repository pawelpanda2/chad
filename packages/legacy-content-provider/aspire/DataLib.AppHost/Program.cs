using System;
using System.IO;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;

// Load .env file from content-provider directory
// The startup script copies .env.local-mac.aspire to .env in the content-provider directory.
var repoRoot = Environment.GetEnvironmentVariable("REPO_ROOT")
    ?? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
var envPath = Path.Combine(repoRoot, "content-provider", ".env");

if (File.Exists(envPath))
{
    DotNetEnv.Env.Load(envPath);
    Console.WriteLine($"[AppHost] Loaded .env from: {envPath}");
}
else
{
    Console.WriteLine($"[AppHost] No .env file found at {envPath}, using defaults");
}

// Read port configuration from .env or use default
var apiPortStr = Environment.GetEnvironmentVariable("CONTENT_PROVIDER_API_PORT") ?? "12024";

if (!int.TryParse(apiPortStr, out int apiPort))
{
    throw new InvalidOperationException(
        $"CONTENT_PROVIDER_API_PORT value '{apiPortStr}' is not a valid integer. Please use a numeric port like 12024.");
}

Console.WriteLine($"[AppHost] Content Provider API port from .env: {apiPort}");

var builder = DistributedApplication.CreateBuilder(args);

// Aspire Dashboard uses ASP.NET Core DataProtection (antiforgery/cookies). If keys are ephemeral
// or stored in a changing location, you'll see errors like:
// "The antiforgery token could not be decrypted".
// Persist keys to a stable folder so dashboard logins survive restarts.
var keyRingPath = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
    ".aspire",
    "datalib",
    "dataprotection-keys");

builder.Services
    .AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keyRingPath))
    .SetApplicationName("DataLib.AspireDashboard");

// Content Provider API - configure to listen on port from .env
var apiService = builder.AddProject<Projects.SharpContainerApi>("content-provider-api")
    .WithHttpEndpoint(port: apiPort, name: "http")
    .WithEnvironment("ASPNETCORE_HTTP_PORTS", apiPort.ToString())
    .WithEnvironment("CONTENT_PROVIDER_ROOT", Path.Combine(repoRoot, "cp-root"));

// Blazor Frontend
var apiUrl = "http://localhost:" + apiPort.ToString();
builder.AddProject<Projects.BlazorApp>("blazor-frontend")
    .WithExternalHttpEndpoints()
    .WithReference(apiService)
    .WithEnvironment("ContentProviderApiUrl", apiUrl);

builder.Build().Run();
