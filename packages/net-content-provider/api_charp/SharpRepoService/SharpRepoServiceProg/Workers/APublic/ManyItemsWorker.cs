using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;
using SharpRepoServiceProg.Workers.CrudWrites;
using SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;
using SharpRepoServiceProg.Workers.System;
using WriteTextWorker = SharpRepoServiceProg.Workers.CrudWrites.WriteTexts.WriteTextWorker;

namespace SharpRepoServiceProg.Workers.APublic;

public class ManyItemsWorker : IManyItemsWorker
{
    private readonly CustomOperationsService _customOperationsService;
    private readonly ReadFolderWorker _readFolder;
    private readonly ReadMultiWorker _readMulti;
    private readonly ReadManyWorker _readMany;
    private readonly BodyWorker _body;
    private readonly PathWorker _path;
    private readonly ConfigWorker _config;
    private readonly SystemWorker _system;
    private readonly WriteTextWorker _writeText;
    private readonly WriteFolderWorker _writeFolder;
    private readonly IFileService _fileService;
    private ReadAddressWorker _address;
    private WriteMultiWorker _writeMulti;
    private readonly ReadTextWorker _readText;

    public ManyItemsWorker()
    {
        _fileService = MyBorder.OutContainer.Resolve<IFileService>();
        _customOperationsService = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        _readFolder = MyBorder.MyContainer.Resolve<ReadFolderWorker>();
        _readText = MyBorder.MyContainer.Resolve<ReadTextWorker>();
        _readMulti = MyBorder.MyContainer.Resolve<ReadMultiWorker>();
        _writeText = MyBorder.MyContainer.Resolve<WriteTextWorker>();
        _readMany = MyBorder.MyContainer.Resolve<ReadManyWorker>();
        _writeFolder = MyBorder.MyContainer.Resolve<WriteFolderWorker>();
        _writeMulti = MyBorder.MyContainer.Resolve<WriteMultiWorker>();
        _address = MyBorder.MyContainer.Resolve<ReadAddressWorker>();
        _body = MyBorder.MyContainer.Resolve<BodyWorker>();
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
        _config = MyBorder.MyContainer.Resolve<ConfigWorker>();
        _system = MyBorder.MyContainer.Resolve<SystemWorker>();
        // _system = MyBorder.MyContainer.Resolve<ReadWorker>();
    }

    public string GetListOfBody(
        (string repo, string loca) adrTuple)
    {
        List<string> result = _readMany.GetManyItemsBody(adrTuple);
        string jsonString = JsonConvert.SerializeObject(result, Formatting.Indented);
        return jsonString;
    }
    
    public string GetList(
        (string repo, string loca) adrTuple)
    {
        List<ItemModel> items = _readMany.GetListOfItems(adrTuple);
        string itemList = JsonConvert.SerializeObject(items);
        return itemList;
    }

    public string PostList(
        (string Repo, string Loca) adrTuple,
        string type,
        List<string> names)
    {
        List<ItemModel> itemList = new();
        foreach (var name in names)
        {
            ItemModel item = new();
            bool s01 = _writeMulti
                .PostItem(ref item, adrTuple, type, name);
            itemList.Add(item);
        }
        string json = JsonConvert.SerializeObject(itemList);
        return json;
    }
    
    public string GetManyByName(
        string repo,
        string loca,
        string name)
    {
        var parentAdrTuple = (repo, loca);
        var parentItem = new ItemModel();
        var bodyJson = _readFolder.GetIndexesQNames(parentAdrTuple);
        var parentAddress = _customOperationsService.UniAddress.CreateAddresFromAdrTuple(parentAdrTuple);

        List<ItemModel> itemModels = new ();
        foreach ((int, string) valueTuple in bodyJson)
        {
            ItemModel item = new();
            try
            {
                // var first = bodyJson.Where(x => x.Item1 == 75).First();
                var indexStr = _customOperationsService.Index
                    .IndexToString(valueTuple.Item1);
                var newLoca = _customOperationsService.UniAddress
                    .JoinLoca(loca, indexStr);
                bool s01 = _readMany.GetAdrTupleByName(
                    (repo, newLoca),
                    name,
                    out var foundAdrTuple);
                if (!s01) {continue;}
                
                var s02 = _readMulti.GetItem(
                    ref item,
                    foundAdrTuple);
                if (!s02) {continue;}
            }
            catch (Exception e)
            {
                continue;
            }
            
            itemModels.Add(item);
        }
        
        string json = JsonConvert.SerializeObject(itemModels);
        return json;
    }
}
