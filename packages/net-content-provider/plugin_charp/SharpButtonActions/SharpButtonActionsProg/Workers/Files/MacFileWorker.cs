using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;
using SharpOperationsProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Files;

public class MacFileWorker : MacOsSystemBase
{
    private OSPlatform _myPlatform = OSPlatform.OSX;

    public MacFileWorker(
        IOperationsService operations)
        : base(operations)
    {
    }

    private void PrepareOpenFile4(
        string filePath)
    {
        string fileName = "OpenFile4.scpt";
        Dictionary<string, string> dict = new()
        {
            { "[[filePath]]", filePath }
        };

        ReplaceScript(fileName, dict);
    }

    public void TryOpenFile(
        string path)
    {
        if (!IsMyOsSystem(_myPlatform)) return;

        PrepareOpenFile4(path);
        RunOsaScript(_osaFilePath);
    }
}
