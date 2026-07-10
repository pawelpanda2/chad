using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;
using SharpOperationsProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Terminals;

public class MacTerminalWorker : MacOsSystemBase
{
    private OSPlatform _myPlatform = OSPlatform.OSX;

    public MacTerminalWorker(
        IOperationsService operations)
            :base(operations)
    {
    }

    private void PrepareOpenTerminal(
        string folderPath)
    {
        var fileName = "OpenTerminal.scpt";
        var dict = new Dictionary<string, string>()
        {
            { "[[folderPath]]", folderPath }
        };

        ReplaceScript(fileName, dict);
    }

    public void TryOpenTerminal(string path)
    {
        if (!IsMyOsSystem(_myPlatform)) { return; }

        PrepareOpenTerminal(path);
        RunOsaScript(_osaFilePath);
    }
}
