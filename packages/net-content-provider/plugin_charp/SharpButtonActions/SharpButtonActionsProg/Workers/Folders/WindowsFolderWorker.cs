using System.Diagnostics;
using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;

namespace SharpButtonActionsProg.Workers.Folders;

public class WindowsFolderWorker : MyPlatformBase
{
    private OSPlatform _myPlatform = OSPlatform.Windows;
    public void TryOpenFolder(string path)
    {
        if (!IsMyOsSystem(_myPlatform)) return;

        string programExePath = "explorer.exe";
        string windowsFormatWorkingDirPath = Path.GetFullPath(path);
        Process.Start(programExePath, windowsFormatWorkingDirPath);
    }
}
