using System;
using SharpRepoServiceProg.Models;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteTexts;

internal partial class WriteTextWorker
{
    public void Patch(
        string content,
        (string Repo, string Loca) adrTuple)
    {
        ItemModel item = new();
        bool s01 = _readFolder.IfMineGetItem(ref item, adrTuple);
        bool s02 = _readText.IfMineGetItem(ref item, adrTuple);
        if (item == default)
        {
            throw new Exception();
        }

        item.Body = content;
        Put(item);
    }

    public (string, string) Append(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        string name,
        string content)
    {
        bool newCreated = IfMineParentPost(ref item, name, adrTuple);
        
        if (!newCreated)
        {
            item.Body += content;
        }
        
        IfMinePut(ref item, name, item.AdrTuple, content);
        return item.AdrTuple;
    }
}
