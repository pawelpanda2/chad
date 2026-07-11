using System.Text;
using System.Text.Json;
using BackendAdapters.DevLogs;
using BackendAdapters.Names;

namespace BackendAdapters.Workers;

public class BackendAdapter
{
    private HttpClient _client;
    private readonly string _strArgApiUrl;
    private readonly IBackendErrorLogger? _errorLogger;

    public BackendAdapter(
        HttpClient client,
        IBackendErrorLogger? errorLogger = null)
    {
        _client = client;
        _errorLogger = errorLogger;
        string baseAdr = client.BaseAddress?.ToString() ?? string.Empty;
        _strArgApiUrl = baseAdr.TrimEnd('/') + "/" + ApiNames.StrArgsApi;
    }

    public async Task<string> InvokeStringArgsApi(
        params string[] args)
    {
        // var sw = Stopwatch.StartNew();
        string json = JsonSerializer.Serialize(args);
        
        try
        {
            StringContent content = new(
                json,
                Encoding.UTF8, 
                "application/json");

            HttpRequestMessage request = new(
                HttpMethod.Post,
                _strArgApiUrl)
            {
                Content = content
            };
            
            HttpResponseMessage response = await _client.SendAsync(request);
            
            string responseJson = await response.Content.ReadAsStringAsync();
            
            // Log successful request
            DevRequestLogStore.Add(new DevRequestLogEntry
            {
                Timestamp = DateTime.Now,
                Method = "POST",
                Url = _strArgApiUrl,
                Args = args,
                RequestBody = json,
                StatusCode = (int)response.StatusCode,
                StatusText = response.StatusCode.ToString(),
                ResponseBody = responseJson,
                // DurationMs = sw.ElapsedMilliseconds
            });
            
            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[BackendAdapter] ERROR: Request failed with status {response.StatusCode}");
                Console.WriteLine($"[BackendAdapter] ERROR: Response: {responseJson}");
            }
            
            // Check for backend error prefix in response
            CheckForBackendError(responseJson, args);
            
            return responseJson;
        }
        catch (Exception ex)
        {
            // Log failed request
            DevRequestLogStore.Add(new DevRequestLogEntry
            {
                Timestamp = DateTime.Now,
                Method = "POST",
                Url = _strArgApiUrl,
                Args = args,
                RequestBody = json,
                Error = ex.ToString(),
                // DurationMs = sw.ElapsedMilliseconds
            });
            
            Console.WriteLine($"[BackendAdapter] EXCEPTION: {ex.GetType().Name}");
            Console.WriteLine($"[BackendAdapter] EXCEPTION Message: {ex.Message}");
            Console.WriteLine($"[BackendAdapter] EXCEPTION StackTrace: {ex.StackTrace}");
            throw;
        }
    }

    /// <summary>
    /// Check if the response contains a backend error (prefixed with "error:")
    /// and log it to the error logger if available.
    /// </summary>
    private void CheckForBackendError(string response, string[] requestArgs)
    {
        if (_errorLogger == null || string.IsNullOrEmpty(response))
            return;

        // Check for error prefix from StringArgsResolverService
        if (response.StartsWith("error:", StringComparison.OrdinalIgnoreCase))
        {
            string errorJson = response.Substring("error:".Length).Trim();
            
            // Extract source from args (worker and method names)
            string source = requestArgs.Length >= 2 
                ? $"{requestArgs[0]}.{requestArgs[1]}" 
                : string.Join(".", requestArgs);
            
            // The raw original log is the full error response (including the "error:" prefix removed)
            // This is what the backend actually sent - preserve it unchanged
            string rawOriginalLog = $"error:{errorJson}";
            
            // Try to parse as JSON for detailed error info
            try
            {
                var errorInfo = JsonSerializer.Deserialize<BackendErrorInfo>(errorJson);
                if (errorInfo != null)
                {
                    _errorLogger.LogBackendError(source, errorInfo, requestArgs, rawOriginalLog);
                }
                else
                {
                    // Fallback: treat as plain text message
                    _errorLogger.LogBackendError(source, errorJson, requestArgs, rawOriginalLog);
                }
            }
            catch
            {
                // Fallback: treat as plain text message
                _errorLogger.LogBackendError(source, errorJson, requestArgs, rawOriginalLog);
            }
        }
    }
}
