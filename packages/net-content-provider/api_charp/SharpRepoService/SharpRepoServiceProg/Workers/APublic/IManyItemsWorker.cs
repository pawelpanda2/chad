using System.Collections.Generic;

namespace SharpRepoServiceProg.Workers.APublic;

public interface IManyItemsWorker
{
    string GetListOfBody(
        (string repo, string loca) adrTuple);

    string GetList(
        (string repo, string loca) adrTuple);

    string PostList(
        (string Repo, string Loca) adrTuple,
        string type,
        List<string> names);

    public string GetManyByName(
        string repo,
        string loca,
        string name);
}
