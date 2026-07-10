using System.Collections.Generic;

namespace SharpRepoServiceProg.Workers.APublic;

public interface IMethodWorker
{
    List<(string Repo, string Loca)> GetAllRepoAddresses(
        (string Repo, string Loca) adrTuple);

    void InitGroupsFromSearchPaths(List<string> searchPaths);
    string GetFirstRepo();
    int GetReposCount();

    public string FindRecursively(
        string repo,
        string loca,
        string phrase);

    string GetText2(
        (string Repo, string Loca) adrTuple);

    public bool GetAdrTupleByName(
        (string Repo, string Loca) adrTuple,
        string name,
        out (string, string) foundAdrTuple);

    bool GetAdrTupleByNameList(
        (string Repo, string Loca) adrTuple,
        out (string, string) foundAdrTuple,
        params string[] names);

    bool GetAdrTupleByNameList(
        (string Repo, string Loca) adrTuple,
        out (string, string) foundAdrTuple,
        List<string> names);

    List<string> GetManyItemByName(
        (string Repo, string Loca) adrTuple,
        List<string> names);

    List<(int, string)> GetManyItemByName2(
        (string Repo, string Loca) adrTuple,
        List<string> names);

    object GetConfigKey(
        (string Repo, string Loca) address,
        string key);

    Dictionary<string, object> GetConfigKeyDict(
        (string Repo, string Loca) address,
        params string[] keyArray);

    List<string> GetManyText((string Repo, string Loca) adrTuple);

    string GetItem(
        (string Repo, string Loca) adrTuple);

    string GetItemList(
        (string repo, string loca) adrTuple);

    string GetLocalName(
        (string repo, string loca) adrTuple);

    string GetItemType(
        (string repo, string loca) adrTuple);

    string GetItemType(
        string repo,
        string loca);

    string GetType(
        (string repo, string loca) adrTuple);

    string GetName(
        (string repo, string loca) adrTuple);

    List<string> GetTextLines(
        (string repo, string loca) adrTuple);

    object TryGetConfigValue(
        (string repo, string loca) adrTuple,
        string keyName);

    List<string> GetAllFoldersNames(
        (string repo, string loca) address);

    (string, string) GetFolderByName(
        string repo,
        string section,
        string name);

    List<(string, string)> GetSubAddresses(
        (string repo, string loca) address);

    string GetAllReposNames();
    List<string> GetAllReposPaths();

    List<(string Repo, string Loca)> GetFolderAdrTupleList(
        (string Repo, string Loca) adrTuple);

    (string Repo, string Loca) GetExistingItem(
        (string Repo, string Loca) address,
        string name);

    int GetFolderLastNumber(
        (string Repo, string Loca) address);

    bool TryGetConfigLines(
        (string Repo, string Loca) address,
        out List<string> lines);

    string GetItemPath(
        (string Repo, string Loca) adrTuple);

    string GetBodyPath(
        (string Repo, string Loca) adrTuple);
    
    string GetConfigPath(
        (string Repo, string Loca) adrTuple);

    void CreateConfigKey(
        (string Repo, string Loca) address,
        string key,
        object value);

    void CreateManyText(
        (string Name, string Location) address,
        List<(string Name, string Content)> nQcList);

    List<string> GetConfigLines(
        (string Repo, string Loca) adrtuple);

    void PatchText(
        string content,
        (string Repo, string Loca) adrTuple);

    (string, string) PutText(
        (string Repo, string Loca) address,
        string name,
        string content = "");

    (string, string) PostText(
        (string Repo, string Loca) adrTuple,
        string name);

    (string Repo, string Loca) CreateChildFolder(
        (string Repo, string Loca) adrTuple,
        string name);

    (string, string) AppendText(
        (string Repo, string Loca) address,
        string name,
        string content);

    void AppendText(
        (string Repo, string Loca) address,
        string content);
}