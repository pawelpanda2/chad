using System.Diagnostics;

namespace BackendAdapters.DevLogs;

public class DevRequestLogEntry
{
    public int Id { get; set; }
    public DateTime Timestamp { get; set; }
    public string Method { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string[] Args { get; set; } = Array.Empty<string>();
    public string RequestBody { get; set; } = string.Empty;
    public int? StatusCode { get; set; }
    public string? StatusText { get; set; }
    public string? ResponseBody { get; set; }
    public string? Error { get; set; }
    public long DurationMs { get; set; }
}

public static class DevRequestLogStore
{
    private static readonly List<DevRequestLogEntry> _entries = new();
    private static int _nextId = 1;
    private const int MaxEntries = 100;

    public static event Action? OnChanged;

    public static IReadOnlyList<DevRequestLogEntry> Entries
    {
        get
        {
            lock (_entries)
            {
                return _entries.AsReadOnly();
            }
        }
    }

    public static void Add(DevRequestLogEntry entry)
    {
        entry.Id = Interlocked.Increment(ref _nextId);
        
        lock (_entries)
        {
            _entries.Insert(0, entry); // Newest first
            
            // Limit to MaxEntries
            if (_entries.Count > MaxEntries)
            {
                _entries.RemoveRange(MaxEntries, _entries.Count - MaxEntries);
            }
        }
        
        OnChanged?.Invoke();
    }

    public static void Clear()
    {
        lock (_entries)
        {
            _entries.Clear();
        }
        
        OnChanged?.Invoke();
    }
}