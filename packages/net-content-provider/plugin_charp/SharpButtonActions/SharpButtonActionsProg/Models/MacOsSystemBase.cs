using System.Diagnostics;
using System.Reflection;
using SharpOperationsProg.AAPublic;

namespace SharpButtonActionsProg.Models;

public class MacOsSystemBase : MyPlatformBase
{
    protected readonly IOperationsService _operations;
    protected string _osaFileName = "osaScript.scpt";
    protected string _osaFilePath;

    public MacOsSystemBase(
        IOperationsService operations)
    {
        _operations = operations;
        _osaFilePath = GetBinFilePath(_osaFileName);
    }
    
    protected void ReplaceScript(
        string fileName,
        Dictionary<string, string> dict)
    {
        string path = "OsaScripts." + fileName;

        string script = _operations.Credentials
            .GetEmbeddedResource(GetAssembly().GetName(), path);

        foreach (var item in dict)
        {
            script = script.Replace(item.Key, item.Value);
        }

        ReplaceBinFile(_osaFileName, script);
    }
    
    private string GetAssemblyFolderPath()
    {
        Assembly assembly = GetAssembly();
        string? path = Path.GetDirectoryName(assembly.CodeBase);
        path = path.Replace("file:", "");
        return path;
    }

    private string ReplaceBinFile(
        string fileName,
        string content)
    {
        string binFolder = GetAssemblyFolderPath();

        string filePath = binFolder + "/" + fileName;
        if (File.Exists(filePath))
        {
            File.Delete(filePath);
        }

        File.WriteAllText(filePath, content);
        return filePath;
    }

    private string GetBinFilePath(
        string fileName)
    {
        string binFolder = GetAssemblyFolderPath();
        string filePath = binFolder + "/" + fileName;
        return filePath;
    }
    protected void RunOsaScript(string scriptPath)
    {
        string test = $" -c \"osascript {scriptPath}\"";
        test = new string(test.Where(c => !char.IsControl(c)).ToArray());
        Console.WriteLine(test);
        ProcessStartInfo startInfo = new()
        {
            UseShellExecute = true,
            WindowStyle = ProcessWindowStyle.Normal,
            FileName = "/bin/bash",
            Arguments = test,
            CreateNoWindow = false,
        };
        Process process = new()
        {
            StartInfo = startInfo,
        };
        process.StartInfo = startInfo;
        bool s1 = process.Start();
    }
    
    private Assembly GetAssembly()
    {
        return Assembly.GetAssembly(GetType());
    }
}
