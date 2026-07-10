namespace BackendAdapters.DevLogs;

/// <summary>
/// Detailed backend error information structure
/// </summary>
public class BackendErrorInfo
{
    public string MessageType { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
    public string? TargetSite { get; set; }
    public string? Source { get; set; }
    public BackendErrorInfo? InnerException { get; set; }
}

/// <summary>
/// Interface for logging backend errors from API responses.
/// This allows BackendAdapter to log errors without depending on BlazorApp.Services.
/// </summary>
public interface IBackendErrorLogger
{
    /// <summary>
    /// Log a backend error from an API response that contains an error prefix.
    /// </summary>
    /// <param name="source">The source of the error (e.g., worker/method name)</param>
    /// <param name="errorInfo">The detailed error information from the backend</param>
    /// <param name="requestArgs">The arguments that were sent to the backend</param>
    /// <param name="rawOriginalLog">The original raw error text exactly as received from the backend. Must be preserved unchanged.</param>
    void LogBackendError(string source, BackendErrorInfo errorInfo, string[] requestArgs, string rawOriginalLog);
    
    /// <summary>
    /// Log a backend error with a simple message (fallback when JSON parsing fails)
    /// </summary>
    /// <param name="source">The source of the error (e.g., worker/method name)</param>
    /// <param name="errorMessage">The error message from the backend</param>
    /// <param name="requestArgs">The arguments that were sent to the backend</param>
    /// <param name="rawOriginalLog">The original raw error text exactly as received from the backend. Must be preserved unchanged.</param>
    void LogBackendError(string source, string errorMessage, string[] requestArgs, string rawOriginalLog);
}
