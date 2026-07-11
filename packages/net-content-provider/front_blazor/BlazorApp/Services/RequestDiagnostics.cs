using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.Json;

namespace BlazorApp.Services
{
    public class RequestDiagnostic
    {
        public string Name { get; set; } = "";
        public string Method { get; set; } = "";
        public string Url { get; set; } = "";
        public string BaseUrl { get; set; } = "";
        public string Path { get; set; } = "";
        public DateTime StartedAt { get; set; }
        public DateTime EndedAt { get; set; }
        public long DurationMs { get; set; }
        public bool ReachedServer { get; set; }
        public int? HttpStatusCode { get; set; }
        public string? HttpStatusCodeText { get; set; }
        public string? ResponseBody { get; set; }
        public string? ErrorType { get; set; }
        public string? ErrorMessage { get; set; }
        public string? InnerException { get; set; }
        public string LikelyCause { get; set; } = "";
    }

    public class ConnectionDiagnostics
    {
        public DateTime Timestamp { get; set; } = DateTime.Now;
        public string CurrentPage { get; set; } = "";
        public string ContentProviderApiUrl { get; set; } = "";
        public bool HasAuthToken { get; set; }
        public List<RequestDiagnostic> Requests { get; set; } = new();
        public string UserAgent { get; set; } = "";

        public string ToDetailedText()
        {
            var sb = new System.Text.StringBuilder();
            
            sb.AppendLine("[Connection Diagnostic]");
            sb.AppendLine();
            
            sb.AppendLine("Timestamp:");
            sb.AppendLine($"{Timestamp:yyyy-MM-dd HH:mm:ss}");
            sb.AppendLine();
            
            sb.AppendLine("Current page URL:");
            sb.AppendLine(CurrentPage);
            sb.AppendLine();
            
            sb.AppendLine("Config:");
            sb.AppendLine($"ContentProviderApiUrl: {ContentProviderApiUrl}");
            sb.AppendLine($"Has auth token: {HasAuthToken}");
            sb.AppendLine($"User Agent: {UserAgent}");
            sb.AppendLine();

            // Check if current page port matches API port (potential misconfiguration)
            var currentPagePort = ExtractPort(CurrentPage);
            var apiPort = ExtractPort(ContentProviderApiUrl);
            if (!string.IsNullOrEmpty(currentPagePort) && currentPagePort == apiPort)
            {
                sb.AppendLine("WARNING:");
                sb.AppendLine("Current page is running on the same port as API.");
                sb.AppendLine("This may indicate that you opened the API URL instead of the Blazor frontend URL,");
                sb.AppendLine("or that Aspire endpoints are misconfigured.");
                sb.AppendLine();
            }
            
            for (int i = 0; i < Requests.Count; i++)
            {
                var req = Requests[i];
                sb.AppendLine($"Request {i + 1}:");
                sb.AppendLine($"Name: {req.Name}");
                sb.AppendLine($"Method: {req.Method}");
                sb.AppendLine($"URL: {req.Url}");
                sb.AppendLine($"Base URL: {req.BaseUrl}");
                sb.AppendLine($"Path: {req.Path}");
                sb.AppendLine($"Started at: {req.StartedAt:yyyy-MM-dd HH:mm:ss.fff}");
                sb.AppendLine($"Ended at: {req.EndedAt:yyyy-MM-dd HH:mm:ss.fff}");
                sb.AppendLine($"Duration ms: {req.DurationMs}");
                sb.AppendLine($"Reached server: {(req.ReachedServer ? "yes" : "no")}");
                sb.AppendLine($"HTTP status: {(req.HttpStatusCode.HasValue ? req.HttpStatusCode.ToString() : "none")}");
                sb.AppendLine($"HTTP status text: {(string.IsNullOrEmpty(req.HttpStatusCodeText) ? "none" : req.HttpStatusCodeText)}");
                sb.AppendLine($"Response body: {(string.IsNullOrEmpty(req.ResponseBody) ? "none" : req.ResponseBody)}");
                sb.AppendLine($"Error type: {(string.IsNullOrEmpty(req.ErrorType) ? "none" : req.ErrorType)}");
                sb.AppendLine($"Error message: {(string.IsNullOrEmpty(req.ErrorMessage) ? "none" : req.ErrorMessage)}");
                if (!string.IsNullOrEmpty(req.InnerException))
                {
                    sb.AppendLine($"Inner exception: {req.InnerException}");
                }
                sb.AppendLine($"Likely cause: {req.LikelyCause}");
                sb.AppendLine();
            }
            
            sb.AppendLine("Diagnostic commands:");
            if (Requests.Count > 0)
            {
                var port = ExtractPort(ContentProviderApiUrl);
                sb.AppendLine($"lsof -i :{port}");
                sb.AppendLine($"curl -v {ContentProviderApiUrl}/swagger");
                
                foreach (var req in Requests)
                {
                    if (req.Method == "POST")
                        sb.AppendLine($"curl -v -X POST {req.Url}");
                    else
                        sb.AppendLine($"curl -v {req.Url}");
                }
            }
            
            return sb.ToString();
        }

        private static string ExtractPort(string url)
        {
            try
            {
                var uri = new Uri(url);
                return uri.Port.ToString();
            }
            catch
            {
                return "6603";
            }
        }
    }
}