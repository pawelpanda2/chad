// using System.Collections.Generic;
// using SharpRepoServiceProg.Models;
//
// namespace SharpRepoServiceProg.Workers.CrudReads;
//
// internal interface IReadWorker
// {
//     ItemModel TryGetItem(
//         (string Repo, string Loca) adrTuple,
//         bool IncludeSubFolder = false);
//
//     ItemModel GetItemBody(
//         (string Repo, string Loca) adrTuple);
//     
//     ItemModel GetItemConfig(
//         (string Repo, string Loca) adrTuple);
//
//     List<ItemModel> GetListOfItems(
//         (string Repo, string Loca) adrTuple);
//
//     object TryGetConfigValue(
//         (string Repo, string Loca) adrTuple,
//         string key);
//
//     List<string> GetTextLines(
//         (string repo, string loca) adrTuple);
//
//     List<(int, string)> GetManyIdxQTextByNames(
//         (string Repo, string Loca) adrTuple,
//         params string[] names);
//
//     (string repo, string newLoca) GetRefAdrTuple(
//         (string repo, string loca) adrTuple);
//
//     List<string> GetManyText(
//         (string Repo, string Loca) adrTuple);
//
//     List<(int, string)> GetManyIdxQText(
//         (string Repo, string Loca) adrTuple);
//
//     List<string> GetManyTextByNames(
//         (string Repo, string Loca) adrTuple,
//         params string[] names);
//
//     Dictionary<string, object> GetConfigDict(
//         (string Repo, string Loca) address,
//         params string[] keyArray);
//
//     List<(int, string)> GetIndexesQNames(
//         (string Repo, string Loca) adrTuple);
//
//     Dictionary<string, string> GetIndexesQNames2(
//         (string Repo, string Loca) adrTuple);
//
//     List<ItemModel> GetItemConfigList(
//         (string Repo, string Loca) adrTuple);
//
//     bool IsSpecialFolder((string, string) adr);
//
//     (string, string) GetFolderByName(
//         string repo,
//         string loca,
//         string name);
//
//     List<string> GetConfigLines(
//         (string Repo, string Loca) adrTuple);
//
//     bool TryGetConfigLines(
//         (string Repo, string Loca) address,
//         out List<string> lines);
//
//     (string, string) GetAdrTupleByName(
//         (string Repo, string Loca) adrTuple,
//         string name);
//
//     object TryGetConfigKey(
//         (string Repo, string Loca) address,
//         string key);
//
//     object GetConfigKey(
//         (string Repo, string Loca) address,
//         string key);
//
//     string GetType(
//         (string repo, string loca) adrTuple);
//
//     (string, string) GetAdrTupleBySequenceOfNames(
//         (string Repo, string Loca) adrTuple,
//         params string[] names);
//
//     int GetFolderLastNumber(
//         (string Repo, string Loca) address);
//
//     List<(string, string)> GetSubAddresses(
//         (string Repo, string Loca) adrTuple);
//
//     List<(string Repo, string Loca)> GetAllRepoAddresses(
//         string repoName);
//
//     List<string> GetAllRepoAddresses();
//     List<string> GetAllReposNames();
//
//     string GetText2(
//         (string Repo, string Loca) adrTuple);
// }