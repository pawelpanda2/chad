using System.Collections.Generic;
using SharpRepoServiceProg.Workers.APublic;
using SharpRepoServiceProg.Workers.APublic.ItemWorkers;
using ItemWorker = SharpRepoServiceProg.Workers.APublic.ItemWorkers.ItemWorker;

namespace SharpRepoServiceProg.AAPublic;

public interface IRepoService
{
    IItemWorker Item { get; }
    
    IManyItemsWorker ManyItems { get; }
    
    IMethodWorker Methods { get; }

    void InitGroupsFromSearchPaths(List<string> searchPaths);

    //(string Repo, string Loca) GetFirstRepo();
}
