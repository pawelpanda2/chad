// using System.Diagnostics;
// using System.Reflection;
// using System.Runtime.InteropServices;
// using SharpOperationsProg.AAPublic;
//
// namespace SharpButtonActionsProg.Backup;
//
// public class MacWorker
// {
//     private readonly IOperationsService operationsService;
//     private string osaFileName;
//     private string osaFilePath;
//
//     public MacWorker(IOperationsService operationsService)
//     {
//         osaFileName = "osaScript.scpt";
//         this.operationsService = operationsService;
//         osaFilePath = GetBinFilePath(osaFileName);
//     }
//
//     private void PrepareOpenFile(string filePath)
//     {
//         string fileName = "OpenFile.scpt";
//         Dictionary<string, string> dict = new()
//         {
//             { "[[filePath]]", filePath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void PrepareOpenFile2(
//         string filePath)
//     {
//         filePath = filePath.Trim('/').Replace("/", ":");
//         var fileName = "OpenFile2.scpt";
//         var dict = new Dictionary<string, string>()
//         {
//             { "[[filePath]]", filePath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void PrepareOpenFile3(
//         string filePath)
//     {
//         var fileName = "OpenFile3.scpt";
//         var dict = new Dictionary<string, string>()
//         {
//             { "[[filePath]]", filePath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void PrepareOpenFile4(
//         string filePath)
//     {
//         var fileName = "OpenFile4.scpt";
//         var dict = new Dictionary<string, string>()
//         {
//             { "[[filePath]]", filePath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void PrepareOpenFolder(
//         string folderPath )
//     {
//         var fileName = "OpenFolder.scpt";
//         var dict = new Dictionary<string, string>()
//         {
//             { "[[folderPath]]", folderPath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void PrepareOpenTerminal(
//         string folderPath)
//     {
//         var fileName = "OpenTerminal.scpt";
//         var dict = new Dictionary<string, string>()
//         {
//             { "[[folderPath]]", folderPath }
//         };
//
//         ReplaceScript(fileName, dict);
//     }
//
//     private void ReplaceScript(
//         string fileName,
//         Dictionary<string, string> dict)
//     {
//         string path = "OsaScripts." + fileName;
//         string script = operationsService.Credentials
//             .GetEmbeddedResource(GetAssembly().GetName(), path);
//
//         foreach (var item in dict)
//         {
//             script = script.Replace(item.Key, item.Value);
//         }
//
//         ReplaceBinFile(osaFileName, script);
//     }
//
//     private void AppPathsCorrect()
//     {
//         // Nova
//         // var exePath = "/Applications/Nova.app/Contents/MacOS/Nova";
//
//         // Terminal
//         // var exePath = "/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal";
//
//         // Finder
//         // var exePath = "/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder";
//     }
//
//     private Assembly GetAssembly()
//     {
//         return Assembly.GetAssembly(this.GetType());
//     }
//
//     private string GetAssemblyFolderPath()
//     {
//         var assembly = GetAssembly();
//         var path = Path.GetDirectoryName(assembly.CodeBase);
//         path = path.Replace("file:", "");
//         return path;
//     }
//
//     private string ReplaceBinFile(string fileName, string content)
//     {
//         var binFolder = GetAssemblyFolderPath();
//
//         var filePath = binFolder + "/" + fileName;
//         if (File.Exists(filePath))
//         {
//             File.Delete(filePath);
//         }
//
//         File.WriteAllText(filePath, content);
//         return filePath;
//     }
//
//     private string GetBinFilePath(string fileName)
//     {
//         var binFolder = GetAssemblyFolderPath();
//         var filePath = binFolder + "/" + fileName;
//         return filePath;
//     }
//
//     public void TryOpenFile(string path)
//     {
//         if (!IsMyOsSystem()) { return; }
//
//         PrepareOpenFile4(path);
//         RunOsaScript(osaFilePath);
//     }
//
//     public void TryOpenFolder(string path)
//     {
//         if (!IsMyOsSystem()) { return; }
//
//         PrepareOpenFolder(path);
//         RunOsaScript(osaFilePath);
//     }
//
//     public void TryOpenTerminal(string path)
//     {
//         if (!IsMyOsSystem()) { return; }
//
//         PrepareOpenTerminal(path);
//         RunOsaScript(osaFilePath);
//     }
//         
//     public void RunOsaScript(string scriptPath)
//     {
//         if (!IsMyOsSystem()) { return; }
//
//         string test = $" -c \"osascript {scriptPath}\"";
//         test = new string(test.Where(c => !char.IsControl(c)).ToArray());
//         Console.WriteLine(test);
//         var startInfo = new ProcessStartInfo
//         {
//             UseShellExecute = true,
//             WindowStyle = ProcessWindowStyle.Normal,
//             FileName = "/bin/bash",
//             Arguments = test,
//             CreateNoWindow = false,
//         };
//         var process = new Process()
//         {
//             StartInfo = startInfo,
//         };
//         process.StartInfo = startInfo;
//         var s1 = process.Start();
//     }
//
//     public void Run(string[] args)
//     {
//     }
//
//     private bool IsMyOsSystem()
//     {
//         var result = RuntimeInformation.IsOSPlatform(OSPlatform.OSX);
//         return result;
//     }
// }