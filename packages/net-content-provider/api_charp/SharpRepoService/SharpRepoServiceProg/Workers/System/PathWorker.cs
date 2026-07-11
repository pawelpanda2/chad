using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Helpers;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.APublic.ItemWorkers;

namespace SharpRepoServiceProg.Workers.System;

internal class PathWorker
{
    public List<string> reposPathsList;
    private string slash = "/";

    private string contentFileName;
    private string configFileName;
    private readonly CustomOperationsService _operations;
    private List<RepoModel> _repoModelsList;
    private readonly ConfigWorker _config;
    private IYamlOperations _yamlOperations;
    private bool _initialized;
    private readonly IFileService _fileService;

    public PathWorker()
    {
        SetNames();
        _operations = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        // _config = MyBorder.MyContainer.Resolve<ConfigWorker>();
        _fileService = MyBorder.OutContainer.Resolve<IFileService>();
        _yamlOperations = _fileService.Yaml.Custom03;
    }

    public List<string> GetAllReposPaths() => reposPathsList;

    private void SetNames()
    {
        configFileName = "config.yaml";
        contentFileName = "body.txt";
    }

    public string[] GetFirstRepo()
    {
        string firstRepo = Path.GetFileName(reposPathsList.First());
        return [firstRepo, ""];
    }

    public string GetItemPath(
        (string Repo, string Loca) adrTuple)
    {
        var elemPath = GetRepoPath(adrTuple.Repo);
        if (adrTuple.Loca != string.Empty)
        {
            elemPath += slash + adrTuple.Loca;
        }

        return elemPath;
    }

    public string GetRepoPath(string repo)
    {
        var foundList = _repoModelsList
            .Where(x => x.Name == repo || x.AdrTuple.Repo.ToString() == repo).ToList();

        if (foundList != null &&
            foundList.Count() == 1)
        {
            string result = foundList.First().Path;
            return result;
        }

        string result2 = HandleError();
        return result2;
    }

    public string GetConfigPath(
        (string Repo, string Location) address)
    {
        string tmp = GetItemPath(address);
        string path = tmp + slash + configFileName;
        return path;
    }

    public string GetBodyPath((string Name, string Location) address)
    {
        string tmp = GetItemPath(address);
        string path = tmp + slash + contentFileName;
        return path;
    }

    public void GetGroupsFromSearchPaths(
        List<string> searchPaths)
    {
        reposPathsList = new List<string>();
        GuidGroupsHelper helper = new();
        List<string> specialFolders = helper.GetSpecialWithGuidFolders(searchPaths);
        searchPaths.AddRange(specialFolders);
        Dictionary<string, List<string>> dict = helper.
            GetGuidGroupsForSearchFolders(searchPaths);
        helper.AddRepoFolders(dict);
        reposPathsList = dict.SelectMany(x => x.Value).ToList();
        reposPathsList.Sort(new RepoPathComparer());
    }
    
    public void GetGroupsFromSearchPaths2(
        List<string> searchPaths)
    {
        // reposPathsList = new List<string>();
        GuidGroupsHelper helper = new();
        // List<string> specialFolders = helper.GetSpecialWithGuidFolders(searchPaths);
        // searchPaths.AddRange(specialFolders);
        Dictionary<string, List<string>> dict = helper.
            GetGuidGroupsForSearchFolders(searchPaths);
        // helper.AddRepoFolders(dict);
        reposPathsList = dict.SelectMany(x => x.Value).ToList();
        reposPathsList.Sort(new RepoPathComparer());

        _repoModelsList = new List<RepoModel>();
        
        foreach (var repo in reposPathsList)
        {
            var path = repo + slash + configFileName;
            var configDict = GetConfigDictionary(path);
            var repoModel = new RepoModel(repo, configDict);
            _repoModelsList.Add(repoModel);
        }
        
    }

    public List<ItemModel> GetAllRepoModels()
    {
        return _repoModelsList.Cast<ItemModel>().ToList();
    }
    
    public List<string> GetConfigLines(
        string configFilePath)
    {
        List<string> configLines = File.ReadAllLines(configFilePath).ToList();
        return configLines;
    }

    private string HandleError()
    {
        throw new InvalidOperationException();
    }

    internal int GetRepoCount()
    {
        var count = _repoModelsList.Count();
        return count;
    }
    
    public Dictionary<string, object> GetConfigDictionary(
        string path)
    {
        // IfNotInitialized();
        Dictionary<string, object> dict = _yamlOperations
            .DeserializeFile<Dictionary<string, object>>(path);
        return dict ?? new Dictionary<string, object>();
    }
    
    // private void IfNotInitialized()
    // {
    //     if (!_initialized)
    //     {
    //         _yamlOperations = MyBorder.OutContainer.Resolve<IYamlOperations>();
    //     }
    // }
}

internal class RepoModel : ItemModel
{
    public string Path { get; }
    // private readonly List<string> _configLines;
    // public readonly ItemModel Item;

    public RepoModel(
        string repoPath,
        Dictionary<string, object> configDict)
    {
        Path = repoPath;
        var s01 = configDict.TryGetValue("id", out var id);
        if (s01)
        {
            configDict["address"] = id;
        }
        this.Settings = configDict;
    }
}
