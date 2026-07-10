using System.Diagnostics;
using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;

namespace SharpButtonActionsProg.Workers.Files;

public class WindowsFileWorker : MyPlatformBase
{
    private OSPlatform _myPlatform = OSPlatform.Windows;

    public void TryOpenFile(string path)
    {
        if (!IsMyOsSystem(_myPlatform)) return;

        string programPath = GetTextEditorPath();
        string windowsFormatWorkingDirPath = Path.GetFullPath(path);
        Process.Start(programPath, windowsFormatWorkingDirPath);
    }

    private string GetTextEditorPath()
    {
        string path01 = "C:/Program Files (x86)/Notepad++/notepad++.exe";
        string path02 = "C:/Program Files/Notepad++/notepad++.exe";
        
        Dictionary<bool, string> dict = new();
        dict.Add(File.Exists(path01), path01);
        dict.Add(File.Exists(path02), path02);
        return dict.FirstOrDefault(x => x.Key).Value;
    }
}
