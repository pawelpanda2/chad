using System.Diagnostics;
using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;

namespace SharpButtonActionsProg.Workers.Terminals;

public class WindowsTerminalWorker : MyPlatformBase
{
    private OSPlatform _myPlatform = OSPlatform.Windows;
    public void TryOpenTerminal(string path)
    {
        if (!IsMyOsSystem(_myPlatform)) { return; }

        string programExePath = GetTerminalPath();
        string windowsFormatWorkingDirPath = Path.GetFullPath(path);
        ProcessStartInfo startInfo = new()
        {
            FileName = programExePath,
            WorkingDirectory = windowsFormatWorkingDirPath,
            UseShellExecute = true
        };
        Process.Start(startInfo);
    }

    private string GetTerminalPath()
    {
        string localApplicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string exePath =
            localApplicationData.Replace('\\', '/')
            + "/"
            + "Programs/Git/usr/bin/bash.exe";
        return exePath;
    }
}
