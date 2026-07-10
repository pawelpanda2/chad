using System.Reflection;
using System.Text.Json;
using SharpApiArgsProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.Operations.Reflection;

namespace SharpApiArgsProg.Services;

public class StringArgsResolverService : IStringArgsResolverService
{
    private Dictionary<string, object> _storeOfServices;
    private readonly FindWorker _findWorker;
    private readonly FindMethod _findMethod;
    private readonly FindParameters _findParameters;
    private readonly IReflectionOpV2 _reflection;

    public StringArgsResolverService(
        List<object> servicesList)
    {
        _findWorker = new FindWorker();
        _findMethod = new FindMethod();
        _findParameters = new FindParameters();
        _reflection = IOperationsService.ReflectionV2;
        
        _storeOfServices = servicesList
            .ToDictionary(x => _reflection.GetInterface(x.GetType()), x => x);
    }

    public string Invoke(string[] args)
    {
        if (args.Length == 0)
        {
            return "";
        }

        if (args.Length == 1)
        {
            PrintAvailableMethods();
        }

        var result = TryRunMethod(args);
        return result;
    }

    private string TryRunMethod(string[] args)
    {
        object? service = _storeOfServices[args[0]];
        if (service == null) return "";
        
        object? worker = _findWorker.Try(args, service);
        if (worker == null) return "";

        MethodInfo? method = _findMethod.Try(args, worker);
        if (method == null) return "";
        
        object[]? parameters = _findParameters.Try(args, method);
        if (parameters == null) return "";
        
        bool success = TryInvoke(worker, method, parameters, out string result);
        if (!success)
        {
            return $"error:{result}";
        }
        
        return result;
    }

    private void PrintAvailableMethods()
    {
    }
    
    private bool TryInvoke(
        object worker,
        MethodInfo method,
        object[] parameters,
        out string result)
    {
        try
        {
            object? resultObj = method.Invoke(worker, parameters);
            result = resultObj?.ToString() ?? "";
            return true;
        }
        catch (Exception e)
        {
            // Build comprehensive error information
            var errorInfo = new BackendErrorInfo
            {
                MessageType = e.GetType().FullName ?? e.GetType().Name,
                Message = e.Message,
                StackTrace = e.StackTrace,
                TargetSite = e.TargetSite?.ToString(),
                Source = e.Source,
                InnerException = e.InnerException != null ? new BackendErrorInfo
                {
                    MessageType = e.InnerException.GetType().FullName ?? e.InnerException.GetType().Name,
                    Message = e.InnerException.Message,
                    StackTrace = e.InnerException.StackTrace,
                    TargetSite = e.InnerException.TargetSite?.ToString(),
                    Source = e.InnerException.Source
                } : null
            };
            
            // Serialize to JSON and prefix with "error:"
            try
            {
                var options = new JsonSerializerOptions 
                { 
                    WriteIndented = false,
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                result = JsonSerializer.Serialize(errorInfo, options);
            }
            catch
            {
                // Fallback if JSON serialization fails
                result = e.Message;
            }
            
            return false;
        }
    }
    
    /// <summary>
    /// Comprehensive error information structure for backend errors
    /// </summary>
    private class BackendErrorInfo
    {
        public string MessageType { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string? StackTrace { get; set; }
        public string? TargetSite { get; set; }
        public string? Source { get; set; }
        public BackendErrorInfo? InnerException { get; set; }
    }
}
