using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class MemoryWorker
{
    public List<string> ReposPathsList { get; private set; }
    public object ErrorValue { get; internal set; }
    private string slash = "/";

    // private string contentFileName;
    // private string configFileName;
    private readonly PathWorker pw;

    public MemoryWorker()
    {
        //this.fileService = MyBorder.Container.Resolve<IFileService>();
        // SetNames();
        this.pw = MyBorder.MyContainer.Resolve<PathWorker>();
    }

    // private void SetNames()
    // {
    //     configFileName = "nazwa.txt";
    //     contentFileName = "content.txt";
    // }

    // memory
    public void InitGroupsFromSearchPaths(List<string> searchPaths)
        => pw.GetGroupsFromSearchPaths2(searchPaths);

    // memory
    public void GetAllReposPaths()
        => pw.GetAllReposPaths();

    public string SelectDirToSection(string section, string dir)
    {
        // DirToSection
        var newSection = Path.GetFileName(dir);
        if (section != string.Empty)
        {
            newSection = section + slash + newSection;
        }

        return newSection;
    }

    public string GetSectionFromPath(
        string repo,
        string path)
    {
        var repoPath = GetRepoPath(repo);
        if (path.StartsWith(repoPath))
        {
            var tmp = path.Replace(repoPath, "");
            var tmp2 = tmp.Trim('/');
            return tmp2;
        }

        return default;
    }

    public string GetItemPath((string Repo, string Loca) address)
    {
        var elemPath = GetRepoPath(address.Repo);
        if (address.Loca != string.Empty)
        {
            elemPath += slash + address.Loca;
        }

        return elemPath;
    }

    public string GetRepoPath(string repo)
    {
        var foundList = ReposPathsList.Where(x => Path.GetFileName(x) == repo).ToList();

        if (foundList != null &&
            foundList.Count() == 1)
        {
            var result = foundList.First();
            return result;
        }

        var result2 = HandleError();
        return result2;
    }

    private string HandleError()
    {
        throw new NotImplementedException();
    }

    // public string GetConfigPath(
    //     (string Repo, string Location) address)
    // {
    //     var tmp = GetLocalPath(address);
    //     var path = tmp + slash + configFileName;
    //     return path;
    // }

    // public string GetBodyPath((string Name, string Location) address)
    // {
    //     var tmp = GetLocalPath(address);
    //     var path = tmp + slash + contentFileName;
    //     return path;
    // }

    public string GetLocalPath((string repo, string loca) address)
    {
        var elemPath = GetRepoPath(address.repo);
        if (address.loca != string.Empty)
        {
            elemPath += slash + address.loca;
        }

        return elemPath;
    }

    // private string GetAddress(string elemPath)
    // {
    //     var path = elemPath + "/" + configFileName;
    //     var name = File.ReadAllLines(path).First();
    //     return name;
    // }
}