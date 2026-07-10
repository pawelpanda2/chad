using System.Reflection;
using SharpContainerApi.AA_public;
using SharpApiArgsProg.AAPublic;
using SharpConfigProg;
using SharpConfigProg.AAPublic;
using SharpContainerProg.AAPublic;
using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpRepoServiceProg.AAPublic;
using OutBorder01 = SharpFileServiceProg.AAPublic.OutBorder;
using OutBorder02 = SharpOperationsProg.AAPublic.OutBorder;

namespace SimpleRun;
public class DefaultPreparer : IPreparer
{
    private Dictionary<string, object> _settingsDict = new();
    private IOperationsService _operationsService;
    private bool _isPreparationDone;
    private IFileService _fileService;
    
    public IAppFasade AppFasade { get; private set; } = null!;

    private int _num = 0;

    public Dictionary<string, object> Prepare()
    {
        if (_isPreparationDone) return _settingsDict;

        SetCurrentDirectoryToAssemblyPath();
        SetAppFasade();
        ConfigurePortFromSettingsIfExists();
        _fileService = OutBorder01.FileService();
        _operationsService = OutBorder02.OperationsService(_fileService);
        
        // REGISTRATIONS
        Registrations();

        // Configure web endpoints (CORS, /health, /invoke)
        ConfigureWebApp();

        _isPreparationDone = true;
        return _settingsDict;
    }
    
    private void ConfigurePortFromSettingsIfExists()
    {
        string? urls = AppFasade.WebAppBuilder.Configuration["ApiUrls"];

        if (string.IsNullOrWhiteSpace(urls))
        {
            StaticOkAndError.Ok("ApiUrls not found in appsettings - using default hosting urls");
            return;
        }

        AppFasade.WebAppBuilder.WebHost.UseUrls(urls);
        StaticOkAndError.Ok("ApiUrls from appsettings: " + urls);
    }

    private void Registrations()
    {
        DefaultRegistration reg = new();
        reg.SettingsDict = _settingsDict;
        reg.FileService = _fileService;
        reg.OperationsService = _operationsService;
        reg.Registrations();

        _num++;
        string consoleMsg = $"DefaultPreparer {_num}) Registrations job done";
        StaticOkAndError.Ok(consoleMsg);
    }
    
    private void SetAppFasade()
    {
        AppFasade = new AppFasade();
        ContainerService.SetOutContainer(AppFasade.Container);
        AppFasade.Container.SetConfigManager(AppFasade.WebAppBuilder.Configuration);
    }

    private void SetCurrentDirectoryToAssemblyPath()
    {
        string preparerAssebmlyFilePath = Assembly.GetAssembly(GetType())
            ?.Location ?? string.Empty;
        string preparerAssebmlyFolderPath = Directory.GetParent(preparerAssebmlyFilePath)
            ?.FullName ?? string.Empty;

        Directory.SetCurrentDirectory(preparerAssebmlyFolderPath);
        StaticOkAndError.Ok("CurrentDirectory: " + Directory.GetCurrentDirectory());
    }

    /// <summary>
    /// Configures the web application with CORS, Swagger, middleware, and endpoints.
    /// This method adds a configuration action to AppFasade.WebAppActionsList,
    /// which will be applied when AppFasade.Run() is called.
    /// </summary>
    private void ConfigureWebApp()
    {
        // Add CORS services to the WebAppBuilder before the app is built
        AppFasade.WebAppBuilder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowAll", policy =>
            {
                policy.AllowAnyOrigin()
                      .AllowAnyMethod()
                      .AllowAnyHeader();
            });
        });

        // Add Swagger services for API documentation
        AppFasade.WebAppBuilder.Services.AddEndpointsApiExplorer();
        AppFasade.WebAppBuilder.Services.AddSwaggerGen();

        // Add endpoint configuration as an action to WebAppActionsList
        // This action will be invoked by AppFasade.Run() after the WebApplication is built
        AppFasade.WebAppActionsList.Add(webApp =>
        {
            // Swagger middleware for API documentation
            webApp.UseSwagger();
            webApp.UseSwaggerUI();

            // Use CORS
            webApp.UseCors("AllowAll");

            // Global exception handling middleware
            webApp.Use(async (context, next) =>
            {
                try
                {
                    await next();
                }
                catch (Exception ex)
                {
                    var timestamp = DateTime.UtcNow;
                    var path = context.Request.Path;
                    var method = context.Request.Method;

                    Console.WriteLine($"[ERROR] {timestamp:yyyy-MM-dd HH:mm:ss.fff}");
                    Console.WriteLine($"[ERROR] {method} {path}");
                    Console.WriteLine($"[ERROR] Exception: {ex.GetType().FullName}");
                    Console.WriteLine($"[ERROR] Message: {ex.Message}");
                    Console.WriteLine($"[ERROR] StackTrace: {ex.StackTrace}");

                    if (ex.InnerException != null)
                    {
                        Console.WriteLine($"[ERROR] InnerException: {ex.InnerException.GetType().FullName}");
                        Console.WriteLine($"[ERROR] InnerMessage: {ex.InnerException.Message}");
                        Console.WriteLine($"[ERROR] InnerStackTrace: {ex.InnerException.StackTrace}");
                    }

                    context.Response.StatusCode = 500;
                    context.Response.ContentType = "application/json";

                    var errorResponse = new
                    {
                        success = false,
                        error = new
                        {
                            timestamp = timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff"),
                            method = method,
                            path = path,
                            exceptionType = ex.GetType().FullName,
                            message = ex.Message,
                            stackTrace = ex.StackTrace,
                            innerException = ex.InnerException != null ? new
                            {
                                type = ex.InnerException.GetType().FullName,
                                message = ex.InnerException.Message,
                                stackTrace = ex.InnerException.StackTrace
                            } : null
                        }
                    };

                    await context.Response.WriteAsJsonAsync(errorResponse);
                }
            });

            // Resolve services from the container (set up by Registrations())
            var argsService = MyBorder.OutContainer.Resolve<IStringArgsResolverService>();

            // Health check endpoint
            // Was checking CONTENT_PROVIDER_ROOT (nothing ever set that env var,
            // so this always reported a false negative) — now checks the config
            // key the backend actually uses to find repos, PreparerModule:NoSqlRepoSearchPaths
            // (see ConfigNames.NoSqlRepoSearchPaths / DefaultRegistration.InitGroupsFromSearchPaths,
            // which reads the same key the same way).
            //
            // repoCount comes from IRepoService.Methods.GetReposCount(), the same
            // count InitGroupsFromSearchPaths() checks at startup (RepoService.cs
            // throws if it's 0) — it walks search paths recursively for GUID-named
            // repo folders (PathWorker._repoModelsList, built once at startup).
            // A plain Directory.GetDirectories(path).Length was tried first but is
            // wrong whenever a search path's immediate children aren't all repos
            // (e.g. pointing at a Dropbox root that also has non-repo folders like
            // "backup" alongside the real "repos" folder) — it undercounts/overcounts
            // and doesn't match what the app itself considers a valid repo.
            webApp.MapGet("/health", () =>
            {
                string[] searchPaths;
                try
                {
                    searchPaths = AppFasade.WebAppBuilder.Configuration
                        .GetSection(ConfigNames.NoSqlRepoSearchPaths)
                        .Get<string[]>() ?? Array.Empty<string>();
                }
                catch
                {
                    searchPaths = Array.Empty<string>();
                }

                var pathDiagnostics = searchPaths.Select(path =>
                {
                    bool exists = false;
                    bool accessible = false;
                    try
                    {
                        exists = Directory.Exists(path);
                        accessible = exists;
                    }
                    catch
                    {
                        accessible = false;
                    }

                    return new { path, exists, accessible };
                }).ToArray();

                int repoCount = 0;
                bool repoServiceAvailable = true;
                try
                {
                    var repoService = MyBorder.OutContainer.Resolve<IRepoService>();
                    repoCount = repoService.Methods.GetReposCount();
                }
                catch
                {
                    repoServiceAvailable = false;
                }

                bool anyRepoFound = repoServiceAvailable && repoCount > 0;
                bool configured = searchPaths.Length > 0;

                return Results.Json(new
                {
                    status = "ok",
                    configured,
                    pathDiagnostics,
                    repoServiceAvailable,
                    repoCount,
                    anyRepoFound,
                    timestamp = DateTime.UtcNow
                });
            });

            // Invoke endpoint - POST /invoke
            // Accepts raw string[] to match BackendAdapter's request format
            // Returns raw result from argsService.Invoke() without wrapping in { success, result }
            webApp.MapPost("/invoke", (string[] args) =>
            {
                var timestamp = DateTime.UtcNow;

                try
                {
                    Console.WriteLine($"[INVOKE] {timestamp:yyyy-MM-dd HH:mm:ss.fff}");
                    Console.WriteLine($"[INVOKE] Args: [{string.Join(", ", args ?? new string[0])}]");

                    if (args == null || args.Length == 0)
                    {
                        Console.WriteLine($"[INVOKE] Error: No arguments provided");
                        return Results.BadRequest(new
                        {
                            error = "No arguments provided"
                        });
                    }

                    var serviceName = args.Length > 0 ? args[0] : "unknown";
                    var methodName = args.Length > 1 ? args[1] : "unknown";
                    Console.WriteLine($"[INVOKE] Resolving: service={serviceName}, method={methodName}");

                    var result = argsService.Invoke(args);

                    Console.WriteLine($"[INVOKE] Success: {serviceName}.{methodName}");

                    // Return raw result directly - frontend expects the data, not a wrapper
                    return Results.Content(result, "application/json");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[INVOKE] EXCEPTION: {ex.GetType().FullName}");
                    Console.WriteLine($"[INVOKE] Message: {ex.Message}");
                    Console.WriteLine($"[INVOKE] StackTrace: {ex.StackTrace}");

                    if (ex.InnerException != null)
                    {
                        Console.WriteLine($"[INVOKE] Inner: {ex.InnerException.GetType().FullName}");
                        Console.WriteLine($"[INVOKE] InnerMessage: {ex.InnerException.Message}");
                        Console.WriteLine($"[INVOKE] InnerStackTrace: {ex.InnerException.StackTrace}");
                    }

                    return Results.Json(new
                    {
                        error = new
                        {
                            timestamp = timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff"),
                            exceptionType = ex.GetType().FullName,
                            message = ex.Message,
                            stackTrace = ex.StackTrace,
                            innerException = ex.InnerException != null ? new
                            {
                                type = ex.InnerException.GetType().FullName,
                                message = ex.InnerException.Message,
                                stackTrace = ex.InnerException.StackTrace
                            } : null
                        }
                    }, statusCode: 500);
                }
            });
        });
    }
}