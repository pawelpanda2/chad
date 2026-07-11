using System.Collections.Concurrent;
using System.Text.Json;
using BackendAdapters.DevLogs;

namespace BlazorApp.Services;

/// <summary>
/// Log level for developer debugging
/// </summary>
public enum DevLogLevel
{
    Info,
    Warning,
    Error,
    Critical
}

/// <summary>
/// Single log entry for developer debugging
/// </summary>
public class DevLogEntry
{
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public DevLogLevel Level { get; set; }
    public string Source { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ExceptionType { get; set; }
    public string? ExceptionMessage { get; set; }
    public string? StackTrace { get; set; }
    public string? RequestUrl { get; set; }
    public string? RequestMethod { get; set; }
    public string? RequestBody { get; set; }
    public string? ResponseStatus { get; set; }
    public string? ResponseBody { get; set; }
    public string? AdditionalData { get; set; }
    
    /// <summary>
    /// The original raw log text exactly as received from the backend.
    /// This must never be modified, overwritten, or regenerated.
    /// Used for the "Raw Details" section in the dev panel.
    /// </summary>
    public string? RawOriginalLog { get; set; }
}

/// <summary>
/// Singleton service for collecting and storing developer debug logs.
/// This service captures errors, exceptions, and diagnostic information
/// that can be displayed in the DevErrorPanel UI component.
/// </summary>
public class DevLogService : IBackendErrorLogger
{
    private readonly List<DevLogEntry> _logs = new();
    private readonly object _lock = new();
    public event Action? OnLogChanged;
    
    // Configuration values for debugging
    public string? ContentProviderApiUrl { get; set; }
    public string? CurrentRepo { get; set; }
    public string? CurrentLoca { get; set; }
    public bool IsAuthDisabled { get; set; }
    public string? BackendAdapterUrl { get; set; }
    
    /// <summary>
    /// Maximum number of log entries to keep in memory
    /// </summary>
    private const int MaxLogEntries = 500;

    /// <summary>
    /// Log an informational message
    /// </summary>
    public void LogInfo(string source, string message, string? additionalData = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Info,
            Source = source,
            Message = message,
            AdditionalData = additionalData
        });
    }

    /// <summary>
    /// Log a warning message
    /// </summary>
    public void LogWarning(string source, string message, string? additionalData = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Warning,
            Source = source,
            Message = message,
            AdditionalData = additionalData
        });
    }

    /// <summary>
    /// Log an error message
    /// </summary>
    public void LogError(string source, string message, string? additionalData = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Error,
            Source = source,
            Message = message,
            AdditionalData = additionalData
        });
    }

    /// <summary>
    /// Log an exception with full details
    /// </summary>
    public void LogException(string source, Exception exception, string? message = null, string? additionalData = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Critical,
            Source = source,
            Message = message ?? exception.Message,
            ExceptionType = exception.GetType().FullName,
            ExceptionMessage = exception.Message,
            StackTrace = exception.StackTrace,
            AdditionalData = additionalData
        });

        // Log inner exceptions too
        if (exception.InnerException != null)
        {
            LogException(source + " (inner)", exception.InnerException, 
                "Inner exception", additionalData);
        }
    }

    /// <summary>
    /// Log a backend request
    /// </summary>
    public void LogRequest(string source, string url, string method, string? body, string? args = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Info,
            Source = source,
            Message = $"HTTP {method} Request",
            RequestUrl = url,
            RequestMethod = method,
            RequestBody = body,
            AdditionalData = args
        });
    }

    /// <summary>
    /// Log a backend response
    /// </summary>
    public void LogResponse(string source, string url, int statusCode, string? body, string? contentType = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Info,
            Source = source,
            Message = $"HTTP Response: {statusCode}",
            RequestUrl = url,
            ResponseStatus = $"{statusCode}",
            ResponseBody = body,
            AdditionalData = contentType
        });
    }

    /// <summary>
    /// Log an error response
    /// </summary>
    public void LogErrorResponse(string source, string url, int statusCode, string? body, Exception? exception = null)
    {
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Error,
            Source = source,
            Message = $"HTTP Error: {statusCode}",
            RequestUrl = url,
            ResponseStatus = $"{statusCode}",
            ResponseBody = body,
            ExceptionType = exception?.GetType().FullName,
            ExceptionMessage = exception?.Message,
            StackTrace = exception?.StackTrace
        });
    }

    private void AddLog(DevLogEntry entry)
    {
        lock (_lock)
        {
            _logs.Insert(0, entry); // Newest first
            
            // Trim old entries
            if (_logs.Count > MaxLogEntries)
            {
                _logs.RemoveRange(MaxLogEntries, _logs.Count - MaxLogEntries);
            }
        }
        
        Console.WriteLine($"[DevLog] [{entry.Level}] {entry.Source}: {entry.Message}");
        OnLogChanged?.Invoke();
    }

    /// <summary>
    /// Get all log entries (newest first)
    /// </summary>
    public IReadOnlyList<DevLogEntry> GetLogs()
    {
        lock (_lock)
        {
            return _logs.AsReadOnly();
        }
    }

    /// <summary>
    /// Get log entries filtered by level
    /// </summary>
    public IReadOnlyList<DevLogEntry> GetLogsByLevel(DevLogLevel level)
    {
        lock (_lock)
        {
            return _logs.Where(l => l.Level == level).ToList().AsReadOnly();
        }
    }

    /// <summary>
    /// Get only error and critical entries
    /// </summary>
    public IReadOnlyList<DevLogEntry> GetErrors()
    {
        lock (_lock)
        {
            return _logs.Where(l => l.Level == DevLogLevel.Error || l.Level == DevLogLevel.Critical)
                .ToList().AsReadOnly();
        }
    }

    /// <summary>
    /// Clear all log entries
    /// </summary>
    public void Clear()
    {
        lock (_lock)
        {
            _logs.Clear();
        }
        OnLogChanged?.Invoke();
    }

    /// <summary>
    /// Clear only exception entries (Error and Critical levels)
    /// </summary>
    public void ClearExceptions()
    {
        lock (_lock)
        {
            _logs.RemoveAll(l => l.Level == DevLogLevel.Error || l.Level == DevLogLevel.Critical);
        }
        OnLogChanged?.Invoke();
    }

    /// <summary>
    /// Log a frontend error without exception (e.g., NotFound route)
    /// </summary>
    public void LogFrontendError(string source, string message, object? context = null)
    {
        string? contextJson = null;
        if (context != null)
        {
            try
            {
                contextJson = JsonSerializer.Serialize(context, new JsonSerializerOptions 
                { 
                    WriteIndented = true
                });
            }
            catch
            {
                contextJson = "Failed to serialize context";
            }
        }

        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Error,
            Source = source,
            Message = message,
            AdditionalData = contextJson
        });
    }

    /// <summary>
    /// Get log count by level
    /// </summary>
    public (int info, int warning, int error, int critical) GetCounts()
    {
        lock (_lock)
        {
            int info = 0, warning = 0, error = 0, critical = 0;
            foreach (var log in _logs)
            {
                switch (log.Level)
                {
                    case DevLogLevel.Info: info++; break;
                    case DevLogLevel.Warning: warning++; break;
                    case DevLogLevel.Error: error++; break;
                    case DevLogLevel.Critical: critical++; break;
                }
            }
            return (info, warning, error, critical);
        }
    }

    /// <summary>
    /// Log a backend error with detailed error information from the backend.
    /// The rawOriginalLog parameter must contain the exact original text from the backend.
    /// </summary>
    public void LogBackendError(string source, BackendErrorInfo errorInfo, string[] requestArgs, string rawOriginalLog)
    {
        string argsJson = string.Join(", ", requestArgs);
        string detailedMessage = BuildDetailedErrorMessage(errorInfo);
        
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Error,
            Source = $"Backend:{source}",
            Message = $"Backend error: {errorInfo.Message}",
            ExceptionType = errorInfo.MessageType,
            ExceptionMessage = errorInfo.Message,
            StackTrace = errorInfo.StackTrace,
            AdditionalData = $"Request args: [{argsJson}]\nTargetSite: {errorInfo.TargetSite}\nSource: {errorInfo.Source}\n\nFull details:\n{detailedMessage}",
            RawOriginalLog = rawOriginalLog  // Store the original raw log unchanged
        });
    }
    
    /// <summary>
    /// Log a backend error with a simple message (fallback when JSON parsing fails).
    /// The rawOriginalLog parameter must contain the exact original text from the backend.
    /// </summary>
    public void LogBackendError(string source, string errorMessage, string[] requestArgs, string rawOriginalLog)
    {
        string argsJson = string.Join(", ", requestArgs);
        AddLog(new DevLogEntry
        {
            Level = DevLogLevel.Error,
            Source = $"Backend:{source}",
            Message = $"Backend error: {errorMessage}",
            AdditionalData = $"Request args: [{argsJson}]",
            RawOriginalLog = rawOriginalLog  // Store the original raw log unchanged
        });
    }
    
    /// <summary>
    /// Build a detailed error message string from BackendErrorInfo including inner exceptions
    /// </summary>
    private string BuildDetailedErrorMessage(BackendErrorInfo errorInfo, int depth = 0)
    {
        var sb = new System.Text.StringBuilder();
        string indent = new string(' ', depth * 2);
        
        sb.AppendLine($"{indent}ExceptionType: {errorInfo.MessageType}");
        sb.AppendLine($"{indent}Message: {errorInfo.Message}");
        if (!string.IsNullOrEmpty(errorInfo.TargetSite))
            sb.AppendLine($"{indent}TargetSite: {errorInfo.TargetSite}");
        if (!string.IsNullOrEmpty(errorInfo.Source))
            sb.AppendLine($"{indent}Source: {errorInfo.Source}");
        if (!string.IsNullOrEmpty(errorInfo.StackTrace))
            sb.AppendLine($"{indent}StackTrace: {errorInfo.StackTrace}");
        
        if (errorInfo.InnerException != null)
        {
            sb.AppendLine($"{indent}Inner Exception:");
            sb.Append(BuildDetailedErrorMessage(errorInfo.InnerException, depth + 1));
        }
        
        return sb.ToString();
    }

    /// <summary>
    /// Export logs as JSON string for debugging
    /// </summary>
    public string ExportLogsAsJson()
    {
        lock (_lock)
        {
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("[");
            for (int i = 0; i < _logs.Count; i++)
            {
                var log = _logs[i];
                sb.AppendLine("  {");
                sb.AppendLine($"    \"timestamp\": \"{log.Timestamp:yyyy-MM-dd HH:mm:ss.fff}\",");
                sb.AppendLine($"    \"level\": \"{log.Level}\",");
                sb.AppendLine($"    \"source\": \"{EscapeJson(log.Source)}\",");
                sb.AppendLine($"    \"message\": \"{EscapeJson(log.Message)}\",");
                if (!string.IsNullOrEmpty(log.ExceptionType))
                    sb.AppendLine($"    \"exceptionType\": \"{EscapeJson(log.ExceptionType)}\",");
                if (!string.IsNullOrEmpty(log.ExceptionMessage))
                    sb.AppendLine($"    \"exceptionMessage\": \"{EscapeJson(log.ExceptionMessage)}\",");
                if (!string.IsNullOrEmpty(log.RequestUrl))
                    sb.AppendLine($"    \"requestUrl\": \"{EscapeJson(log.RequestUrl)}\",");
                if (!string.IsNullOrEmpty(log.ResponseStatus))
                    sb.AppendLine($"    \"responseStatus\": \"{log.ResponseStatus}\",");
                sb.AppendLine("  }" + (i < _logs.Count - 1 ? "," : ""));
            }
            sb.AppendLine("]");
            return sb.ToString();
        }
    }

    private static string EscapeJson(string? value)
    {
        if (string.IsNullOrEmpty(value)) return string.Empty;
        return value.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r");
    }
}