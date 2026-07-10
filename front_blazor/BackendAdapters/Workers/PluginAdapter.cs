using System.Text.Json;
using BackendAdapters.DevLogs;
using BackendAdapters.Operations;

namespace BackendAdapters.Workers;

public class PluginAdapter
{
    private readonly HttpClient _client;
    private readonly string _pluginBaseUrl;

    public PluginAdapter()
    {
        _pluginBaseUrl = "http://localhost:12026";
        _pluginBaseUrl = _pluginBaseUrl.TrimEnd('/');
        
        _client = new HttpClient();
        _client.BaseAddress = new Uri(_pluginBaseUrl);
    }

    /// <summary>
    /// Builds the address string from repo GUID and local path.
    /// Format: {repoGuid}-{local}
    /// </summary>
    private string BuildAddress(string repo, string local)
    {
        if (string.IsNullOrEmpty(local))
        {
            return $"{repo}";
        }
        return $"{repo}-{local}";
    }

    /// <summary>
    /// Opens config.yaml file in Nova editor via plugin.
    /// </summary>
    public async Task<PluginResponse> OpenConfig(
        (string Repo, string Loca) adrTuple)
    {
        // string address = BuildAddress(adrTuple.Repo, adrTuple.Loca);
        string address = IFrontendOperations.NoSqlAddress.GetAddressString(adrTuple, "-");
        return await SendRequest($"openconfig/{address}");
    }

    /// <summary>
    /// Opens body.txt file in Nova editor via plugin.
    /// </summary>
    public async Task<PluginResponse> OpenBody(
        (string Repo, string Loca) adrTuple)
    {
        // string address = BuildAddress(adrTuple.Repo, adrTuple.Loca);
        string address = IFrontendOperations.NoSqlAddress.GetAddressString(adrTuple, "-");
        return await SendRequest($"openbody/{address}");
    }

    /// <summary>
    /// Opens folder in Finder via plugin.
    /// </summary>
    public async Task<PluginResponse> OpenItemFolder(
        (string Repo, string Loca) adrTuple)
    {
        // string address = BuildAddress(adrTuple.Repo, adrTuple.Loca);
        string address = IFrontendOperations.NoSqlAddress.GetAddressString(adrTuple, "-");
        return await SendRequest($"openfolder/{address}");
    }

    /// <summary>
    /// Opens Terminal in the specified folder via plugin.
    /// </summary>
    public async Task<PluginResponse> OpenTerminal(
        (string Repo, string Loca) adrTuple)
    {
        string address = IFrontendOperations.NoSqlAddress.GetAddressString(adrTuple, "-");
        // string address = BuildAddress(adrTuple.Repo, adrTuple.Loca);
        return await SendRequest($"terminal/{address}");
    }

    /// <summary>
    /// Sends a GET request to the plugin and returns the response.
    /// </summary>
    private async Task<PluginResponse> SendRequest(string endpoint)
    {
        string url = $"{_pluginBaseUrl}/{endpoint}";
        string requestBody = $"GET /{endpoint}"; // Include endpoint info for visibility in dev panel
        
        try
        {
            HttpResponseMessage response = await _client.GetAsync(endpoint);
            string responseJson = await response.Content.ReadAsStringAsync();

            // Log successful request
            DevRequestLogStore.Add(new DevRequestLogEntry
            {
                Timestamp = DateTime.Now,
                Method = "GET",
                Url = url,
                Args = Array.Empty<string>(),
                RequestBody = requestBody,
                StatusCode = (int)response.StatusCode,
                StatusText = response.StatusCode.ToString(),
                ResponseBody = responseJson,
            });

            if (!response.IsSuccessStatusCode)
            {
                Console.WriteLine($"[PluginAdapter] ERROR: Request failed with status {response.StatusCode}");
                Console.WriteLine($"[PluginAdapter] ERROR: Response: {responseJson}");
                
                return new PluginResponse
                {
                    Success = false,
                    Error = responseJson
                };
            }

            var pluginResponse = JsonSerializer.Deserialize<PluginResponse>(responseJson);
            if (pluginResponse != null)
            {
                pluginResponse.Success = true;
            }
            return pluginResponse ?? new PluginResponse { Success = false, Error = "Empty response" };
        }
        catch (Exception ex)
        {
            // Log failed request
            DevRequestLogStore.Add(new DevRequestLogEntry
            {
                Timestamp = DateTime.Now,
                Method = "GET",
                Url = url,
                Args = Array.Empty<string>(),
                RequestBody = requestBody,
                Error = ex.ToString(),
            });
            
            Console.WriteLine($"[PluginAdapter] EXCEPTION: {ex.GetType().Name}");
            Console.WriteLine($"[PluginAdapter] EXCEPTION Message: {ex.Message}");
            
            return new PluginResponse
            {
                Success = false,
                Error = ex.Message
            };
        }
    }

    /// <summary>
    /// Checks if the plugin is running and healthy.
    /// </summary>
    public async Task<bool> IsPluginHealthy()
    {
        try
        {
            HttpResponseMessage response = await _client.GetAsync("/health");
            return response.IsSuccessStatusCode;
        }
        catch
        {
            return false;
        }
    }
}

/// <summary>
/// Response from the plugin API.
/// </summary>
public class PluginResponse
{
    public bool Success { get; set; }
    public string? Message { get; set; }
    public string? Path { get; set; }
    public string? Error { get; set; }
}
