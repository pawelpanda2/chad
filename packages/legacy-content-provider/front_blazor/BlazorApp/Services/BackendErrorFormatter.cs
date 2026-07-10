using System.Text.RegularExpressions;
using BackendAdapters.DevLogs;

namespace BlazorApp.Services;

/// <summary>
/// Formatted backend error with human-readable sections
/// </summary>
public class FormattedBackendError
{
    // Header info
    public string Time { get; set; } = string.Empty;
    public string MethodCall { get; set; } = string.Empty;
    
    // Error info
    public string? WrapperType { get; set; }
    public string ErrorType { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public string? ErrorPath { get; set; }
    
    // Location info (from stack trace)
    public string? File { get; set; }
    public string? Line { get; set; }
    public string? Method { get; set; }
    
    // Call chain
    public List<string> CallChain { get; set; } = new();
    
    // Diagnosis
    public string? LikelyCause { get; set; }
    
    // Raw data - always preserved unchanged from backend
    /// <summary>
    /// The original raw log text exactly as received from the backend.
    /// This must NEVER be modified, overwritten, or regenerated.
    /// Used for the "Raw Details" collapsible section in the dev panel.
    /// </summary>
    public string RawOriginalLog { get; set; } = string.Empty;
    
    /// <summary>
    /// The full stack trace from the backend error.
    /// </summary>
    public string RawStackTrace { get; set; } = string.Empty;
}

/// <summary>
/// Service that formats backend errors into human-readable format.
/// Parses BackendErrorInfo structure and extracts meaningful information
/// while preserving raw data for debugging.
/// </summary>
public class BackendErrorFormatter
{
    // Known error patterns and their likely causes
    private static readonly Dictionary<Regex, string> KnownErrorPatterns = new()
    {
        // Read-only filesystem errors
        { new Regex(@"Read-only file system", RegexOptions.IgnoreCase), 
          "Docker volume / Dropbox path is mounted read-only or container has no write access." },
        
        // Permission denied
        { new Regex(@"Permission denied", RegexOptions.IgnoreCase), 
          "Container process lacks permission to access the specified path. Check file ownership and permissions." },
        
        // Access to path denied
        { new Regex(@"Access to the path .* is denied", RegexOptions.IgnoreCase), 
          "Container process lacks permission to access the specified path. Check file ownership and permissions." },
        
        // Disk full
        { new Regex(@"There is not enough space on the disk", RegexOptions.IgnoreCase), 
          "Disk is full or quota exceeded. Free up disk space or increase storage allocation." },
        
        // File not found
        { new Regex(@"Could not find file", RegexOptions.IgnoreCase), 
          "Missing file at the resolved path. For Text item, check whether body.txt exists." },
        
        // Path not found
        { new Regex(@"Could not find a part of the path", RegexOptions.IgnoreCase), 
          "The specified directory or file path does not exist. Check that all parent directories exist." },
        
        // File in use
        { new Regex(@"The process cannot access the file .* because it is being used by another process", RegexOptions.IgnoreCase), 
          "Another process has locked this file. Close other applications using this file or wait for the lock to be released." },
        
        // Network path not found
        { new Regex(@"The network path was not found", RegexOptions.IgnoreCase), 
          "Network share or mounted volume is not accessible. Check network connectivity and mount points." },
        
        // Invalid path characters
        { new Regex(@"Illegal characters in path", RegexOptions.IgnoreCase), 
          "The file path contains characters that are not valid for the filesystem. Check for special characters like *, ?, <, >, |, etc." },
    };

    /// <summary>
    /// Format a backend error into a human-readable structure.
    /// The rawOriginalLog parameter must contain the exact original text from the backend.
    /// </summary>
    public FormattedBackendError Format(BackendErrorInfo errorInfo, string source, DateTime timestamp, string[] requestArgs, string rawOriginalLog)
    {
        // Diagnostic logging - always log request args to help debug issues
        Console.WriteLine($"[BackendErrorFormatter] === Diagnostic for error ===");
        Console.WriteLine($"[BackendErrorFormatter]   requestArgs.Count = {requestArgs.Length}");
        for (int i = 0; i < requestArgs.Length; i++)
        {
            Console.WriteLine($"[BackendErrorFormatter]   arg{i} = {requestArgs[i]}");
        }
        var builtCall = BuildMethodCall(requestArgs);
        Console.WriteLine($"[BackendErrorFormatter]   Built call = {builtCall}");
        Console.WriteLine($"[BackendErrorFormatter] ==========================");

        var formatted = new FormattedBackendError
        {
            Time = timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff"),
            MethodCall = builtCall,
            RawStackTrace = errorInfo.StackTrace ?? string.Empty,
            RawOriginalLog = rawOriginalLog  // Store the original raw log unchanged
        };

        // Parse the error hierarchy to find the real error (innermost non-wrapper exception)
        var realError = FindRealError(errorInfo);
        
        // Set error type and message from the real error
        formatted.ErrorType = realError.MessageType;
        formatted.ErrorMessage = realError.Message;
        
        // If the outer exception is a wrapper (like TargetInvocationException), note it
        if (IsWrapperException(errorInfo.MessageType))
        {
            formatted.WrapperType = errorInfo.MessageType;
        }
        
        // Extract path from error message
        formatted.ErrorPath = ExtractPath(realError.Message);
        
        // Parse stack trace for location info
        ParseStackTrace(errorInfo.StackTrace, formatted);
        
        // Build call chain from stack trace
        formatted.CallChain = BuildCallChain(errorInfo.StackTrace);
        
        // Determine likely cause
        formatted.LikelyCause = DetermineLikelyCause(realError.Message, errorInfo.StackTrace);
        
        return formatted;
    }

    /// <summary>
    /// Build a method call string from request arguments.
    /// Rules:
    /// - if args.Count >= 3: arg0 = service, arg1 = worker, arg2 = method, arg3+ = method args
    ///   returns: "service.worker.method(arg3, arg4, ...)"
    /// - if args.Count == 2: returns "arg0.arg1"
    /// - if args.Count == 1: returns "arg0"
    /// - if no args: returns "(unknown backend call)"
    /// </summary>
    public static string BuildMethodCall(IReadOnlyList<string> args)
    {
        if (args == null || args.Count == 0)
        {
            return "(unknown backend call)";
        }

        if (args.Count == 1)
        {
            return args[0];
        }

        if (args.Count == 2)
        {
            return $"{args[0]}.{args[1]}";
        }

        // args.Count >= 3
        var service = args[0];
        var worker = args[1];
        var method = args[2];
        var methodArgs = args.Skip(3).ToList();

        if (methodArgs.Count == 0)
        {
            return $"{service}.{worker}.{method}()";
        }

        return $"{service}.{worker}.{method}({string.Join(", ", methodArgs)})";
    }

    /// <summary>
    /// Find the real error by traversing inner exceptions.
    /// Stops at the first non-wrapper exception.
    /// </summary>
    private BackendErrorInfo FindRealError(BackendErrorInfo errorInfo)
    {
        var current = errorInfo;
        
        // Traverse inner exceptions until we find a non-wrapper
        while (current.InnerException != null && IsWrapperException(current.MessageType))
        {
            current = current.InnerException;
        }
        
        return current;
    }

    /// <summary>
    /// Check if an exception type is just a wrapper (not the real error)
    /// </summary>
    private bool IsWrapperException(string exceptionType)
    {
        if (string.IsNullOrEmpty(exceptionType)) return false;
        
        var wrapperTypes = new[]
        {
            "System.Reflection.TargetInvocationException",
            "System.AggregateException",
            "System.Threading.Tasks.TaskCanceledException",
            "System.Runtime.CompilerServices.TaskAwaiter",
            "System.ComponentModel.Win32Exception"
        };
        
        return wrapperTypes.Any(wt => exceptionType.Contains(wt, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Extract file path from error message
    /// </summary>
    private string? ExtractPath(string message)
    {
        if (string.IsNullOrEmpty(message)) return null;
        
        // Match paths in quotes - preserve the leading slash for Unix paths
        var patterns = new[]
        {
            @"['""]((?:\/[^'""]+)|([^'""]*\/[^'""]*))['""]",  // Path in quotes (Unix or any with /)
            @":\s*(['""]?)(\/[^'"":\n]+)",                     // Path after colon (Unix)
        };
        
        foreach (var pattern in patterns)
        {
            var match = Regex.Match(message, pattern);
            if (match.Success)
            {
                var path = match.Groups[1].Success ? match.Groups[1].Value : match.Groups[2].Value;
                // Keep leading slash for Unix paths
                return path.Trim();
            }
        }
        
        return null;
    }

    /// <summary>
    /// Parse stack trace for location information
    /// </summary>
    private void ParseStackTrace(string? stackTrace, FormattedBackendError formatted)
    {
        if (string.IsNullOrEmpty(stackTrace)) return;
        
        // Look for the first frame with file information
        // Pattern: in C:\path\file.cs:line 123 or in /path/file.cs:line 123
        var lines = stackTrace.Split(new[] { "\n", "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            
            // Look for file:line pattern
            var fileMatch = Regex.Match(trimmed, @"in\s+(.+):line\s+(\d+)");
            if (fileMatch.Success)
            {
                var fullPath = fileMatch.Groups[1].Value;
                formatted.File = Path.GetFileName(fullPath);
                formatted.Line = fileMatch.Groups[2].Value;
                
                // Extract method from the same line (before "in")
                var methodMatch = Regex.Match(trimmed, @"at\s+(.+)\s+in\s+");
                if (methodMatch.Success)
                {
                    var methodFullName = methodMatch.Groups[1].Value.Trim();
                    // Simplify to show just Class.Method
                    formatted.Method = SimplifyMethodName(methodFullName);
                }
                break;
            }
        }
    }

    /// <summary>
    /// Build call chain from stack trace
    /// </summary>
    private List<string> BuildCallChain(string? stackTrace)
    {
        var result = new List<string>();
        
        if (string.IsNullOrEmpty(stackTrace)) return result;
        
        var lines = stackTrace.Split(new[] { "\n", "\r\n" }, StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var line in lines)
        {
            var trimmed = line.Trim();
            
            // Extract method name from stack trace line
            // Pattern: at Namespace.Class.Method(args) in file:line
            var match = Regex.Match(trimmed, @"at\s+([^\s]+)\(");
            if (match.Success)
            {
                var fullName = match.Groups[1].Value;
                
                // Simplify to show just the relevant parts
                var simplified = SimplifyMethodName(fullName);
                if (!result.Contains(simplified))
                {
                    result.Add(simplified);
                }
            }
        }
        
        return result;
    }

    /// <summary>
    /// Simplify a method name for display
    /// </summary>
    private string SimplifyMethodName(string fullName)
    {
        // Remove generic type parameters
        var result = fullName;
        var genericIndex = result.IndexOf('`');
        if (genericIndex >= 0)
        {
            result = result.Substring(0, genericIndex);
        }
        
        // Get just the last parts (Class.Method)
        var parts = result.Split('.');
        if (parts.Length > 2)
        {
            return $"{parts[parts.Length - 2]}.{parts[parts.Length - 1]}";
        }
        
        return result;
    }

    /// <summary>
    /// Determine likely cause based on error message patterns
    /// </summary>
    private string? DetermineLikelyCause(string message, string? stackTrace)
    {
        var textToCheck = $"{message} {stackTrace}".ToLowerInvariant();
        
        foreach (var pattern in KnownErrorPatterns)
        {
            if (pattern.Key.IsMatch(textToCheck))
            {
                return pattern.Value;
            }
        }
        
        return null;
    }

    /// <summary>
    /// Format a simple backend error (fallback when JSON parsing fails).
    /// The rawOriginalLog parameter must contain the exact original text from the backend.
    /// </summary>
    public FormattedBackendError FormatSimple(string errorMessage, string source, DateTime timestamp, string[] requestArgs, string rawOriginalLog)
    {
        var formatted = new FormattedBackendError
        {
            Time = timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff"),
            MethodCall = BuildMethodCall(requestArgs),
            ErrorMessage = errorMessage,
            ErrorType = "Unknown",
            RawOriginalLog = rawOriginalLog,  // Store the original raw log unchanged
        };
        
        // Try to extract some info from the simple message
        formatted.ErrorPath = ExtractPath(errorMessage);
        formatted.LikelyCause = DetermineLikelyCause(errorMessage, null);
        
        return formatted;
    }
}