using Microsoft.JSInterop;

namespace BlazorApp.Workers;

public class PageTitleWorker
{
    private string _currentTitle = string.Empty;

    public async Task SetTitle(IJSRuntime js, string title)
    {
        if (string.IsNullOrEmpty(title))
            title = "NotesSystem";
            
        // Unikaj niepotrzebnych wywołań JS jeśli tytuł się nie zmienił
        if (_currentTitle == title)
            return;

        try
        {
            // Użyj bardziej bezpośredniego podejścia, podobnego do TabIdStorageWorker
            await js.InvokeVoidAsync("eval", $@"
                (function() {{
                    const newTitle = '{EscapeJavaScript(title)}';
                    console.log('Setting title to: ' + newTitle);
                    
                    // Ustaw tytuł bezpośrednio
                    document.title = newTitle;
                    
                    // Wymuś refresh DOM
                    if (document.head) {{
                        let titleTag = document.head.querySelector('title');
                        if (!titleTag) {{
                            titleTag = document.createElement('title');
                            document.head.appendChild(titleTag);
                        }}
                        titleTag.textContent = newTitle;
                    }}
                    
                    // Sprawdź czy się udało
                    setTimeout(() => {{
                        console.log('Title set successfully, current title: ' + document.title);
                    }}, 100);
                    
                    return newTitle;
                }})()
            ");

            _currentTitle = title;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error setting title: {ex.Message}");
        }
    }

    public async Task<string> GetTitle(IJSRuntime js)
    {
        try
        {
            string result = await js.InvokeAsync<string>("eval", @"
                (function() {
                    return document.title || 'NotesSystem';
                })()
            ");
            return result;
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error getting title: {ex.Message}");
            return "NotesSystem";
        }
    }

    private static string EscapeJavaScript(string text)
    {
        if (string.IsNullOrEmpty(text))
            return string.Empty;
            
        return text
            .Replace("\\", "\\\\")
            .Replace("'", "\\'")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r");
    }
}