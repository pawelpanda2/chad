
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace SharpRepoServiceProg.Helpers;

public class GuidGroupsHelperBackup
{
    public List<string> GetSpecialWithGuidFolders(
        List<string> searchFolders)
    {
        List<string> specialsWithGuidFolders = new();
        foreach (var searchFolder in searchFolders)
        {
            string[] toCheckFolders = Directory.GetDirectories(searchFolder); 
            foreach (var toCheckFolder in toCheckFolders)
            {
                if (IsSpecialWithGuidFolders(toCheckFolder))
                {
                    specialsWithGuidFolders.Add(toCheckFolder);
                }
            }
        }

        return specialsWithGuidFolders;
    }

    private bool IsSpecialWithGuidFolders(
        string searchFolder)
    {
        string[] dirs = Directory.GetDirectories(searchFolder);
        bool hasGit = dirs.Any(x => Path.GetFileName(x) == ".git");
        bool hasGuidFolder = dirs.Any(x => Guid.TryParse(Path.GetFileName(x), out _));
        return hasGit && hasGuidFolder;
    }

    public Dictionary<string, List<string>> GetGuidGroupsForSearchFolders(
        List<string> searchFolders)
    {
        Dictionary<string, List<string>> dict = new();

        var first = searchFolders.First() + "/" + "repos";
        var found = Directory.Exists(first);

        if (!found)
        {
            return new Dictionary<string, List<string>>();
        }

        var possibleGuidFolders = Directory.GetDirectories(first);
        
        foreach (var possibleGuidFolder in possibleGuidFolders)
        {
            if (IsUniRepoGroupFolder(possibleGuidFolder))
            {
                if (!dict.ContainsKey(possibleGuidFolder))
                {
                    dict.Add(possibleGuidFolder, new List<string>());
                }
            }
        }

        return dict;
    }

    public void AddRepoFolders(
        Dictionary<string, List<string>> dict)
    {
        foreach (var keyValue in dict)
        {
            string guidFolder = keyValue.Key;
            List<string> repoFolders = Directory.GetDirectories(guidFolder)
                .Select(x => CorrectPath(x))
                .ToList();
            dict[guidFolder].AddRange(repoFolders);
        }
    }

    private bool IsUniRepoGroupFolder(string folder)
    {
        string name = Path.GetFileName(folder);
        bool isGuid = Guid.TryParse(name, out Guid guid);
        return isGuid;
    }

    public string CorrectPath(string path)
    {
        return path.Replace("\\", "/");
    }
}
