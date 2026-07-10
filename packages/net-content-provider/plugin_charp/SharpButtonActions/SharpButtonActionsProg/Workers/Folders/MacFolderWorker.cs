using System.Runtime.InteropServices;
using SharpButtonActionsProg.Models;
using SharpOperationsProg.AAPublic;

namespace SharpButtonActionsProg.Workers.Folders;

public class MacFolderWorker : MacOsSystemBase
{
    private OSPlatform _myPlatform = OSPlatform.OSX;
    public MacFolderWorker(
        IOperationsService operations)
        :base(operations)
    {
    }

    private void PrepareOpenFolder(
        string folderPath )
    {
        string fileName = "OpenFolder.scpt";
        Dictionary<string, string> dict = new()
        {
            { "[[folderPath]]", folderPath }
        };

        ReplaceScript(fileName, dict);
    }

    public void TryOpenFolder(
        string path)
    {
        if (!IsMyOsSystem(_myPlatform)) return;

        PrepareOpenFolder(path);
        RunOsaScript(_osaFilePath);
    }
}
