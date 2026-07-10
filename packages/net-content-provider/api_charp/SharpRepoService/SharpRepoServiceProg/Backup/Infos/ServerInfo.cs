// using System;
// using System.IO;
//
// namespace SharpRepoServiceProg.Infos;
//
// public class ServerInfo
// {
//     public ServerInfo()
//     {
//         HostName = "serwer2272804.home.pl";
//         Port = 22222;
//         UserName = "1234567";
//         Password = "1234567";
//
//         PathLocalOfRoot = "D:/01_Synchronized/01_Programming_Files";
//         SShRootAddress = GetSShRootAddress();
//         SShPublicHtmlPath = "home/notki/public_html";
//     }
//
//     private string GetSShRootAddress()
//     {
//         var sshRootAddress = @"ssh://" + UserName + "@" + HostName + ":" + Port;
//         return sshRootAddress;
//     }
//
//     public string PathLocalOfRoot { get; }
//     public string PathRemoteOfRoot { get; }
//     public string SShRootAddress { get; }
//
//     public string SShPublicHtmlPath { get; }
//         
//     public string AliasesPath { get; }
//
//     private string Slash => "/";
//
//     public string UserName { get; }
//     public string Password { get; }
//     public int Port { get; }
//     public string HostName { get; }
//         
//
//     public string GetPath(string groupName, string repoName)
//     {
//         var path = PathLocalOfRoot + Slash + groupName + Slash + repoName;
//         return path;
//     }
//
//     public string GetSShConnectionString()
//     {
//         var result = $"ssh://{HostName}:{Port}";
//         return result;
//     }
//
//     public (string group, string repo) PathToGroupAndName(string path)
//     {
//         var repo = Path.GetFileName(path);
//         var group = Path.GetFileName(Directory.GetParent(path).FullName);
//
//         if (Guid.TryParse(group, out var _))
//         {
//             return (group, repo);
//         }
//
//         return (default, default);
//     }
// }