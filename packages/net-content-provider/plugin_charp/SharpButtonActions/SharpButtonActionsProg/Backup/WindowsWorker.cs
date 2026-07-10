// using System.Diagnostics;
// using System.Runtime.InteropServices;
//
// namespace SharpButtonActionsProg.Backup;
//
// public class WindowsWorker
// {
//     private bool IsMyOsSystem()
//     {
//         bool result = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
//         return result;
//     }
//
//     public void TryOpenFolder(string path)
//     {
//         if (!IsMyOsSystem()) return;
//
//         string programExePath = "explorer.exe";
//         string windowsFormatWorkingDirPath = Path.GetFullPath(path);
//         Process.Start(programExePath, windowsFormatWorkingDirPath);
//     }
//
//     public void TryOpenFile(string path)
//     {
//         if (!IsMyOsSystem()) return;
//
//         string programPath = GetTextEditorPath();
//         string windowsFormatWorkingDirPath = Path.GetFullPath(path);
//         Process.Start(programPath, windowsFormatWorkingDirPath);
//     }
//     
//     public void TryOpenTerminal(string path)
//     {
//         if (!IsMyOsSystem()) return;
//
//         string programExePath = GetTerminalPath();
//         string windowsFormatWorkingDirPath = Path.GetFullPath(path);
//         ProcessStartInfo startInfo = new()
//         {
//             FileName = programExePath,
//             WorkingDirectory = windowsFormatWorkingDirPath,
//             UseShellExecute = true
//         };
//         Process.Start(startInfo);
//     }
//
//     private string GetTextEditorPath()
//     {
//         string path01 = "C:/Program Files (x86)/Notepad++/notepad++.exe";
//         string path02 = "C:/Program Files/Notepad++/notepad++.exe";
//         
//         Dictionary<bool, string> dict = new();
//         dict.Add(File.Exists(path01), path01);
//         dict.Add(File.Exists(path02), path02);
//         return dict.FirstOrDefault(x => x.Key).Value;
//     }
//
//     private string GetTerminalPath()
//     {
//         string localApplicationData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
//         string exePath =
//             localApplicationData.Replace('\\', '/')
//             + "/"
//             + "Programs/Git/usr/bin/bash.exe";
//         return exePath;
//     }
// }
