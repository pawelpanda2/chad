//using System.Collections.Generic;
//using SharpFileServiceProg.Service;
//using SharpRepoServiceProg.Names;
//using SharpRepoServiceProg.Workers;

//public class IdQLocaCacheWorker
//{
//    private Dictionary<string, string> idQlocaDict;
//    private JsonWorker itemWorker;
//    private IOperationsService operationsService;

//    private (string, string) idQLocaAdrTuple;

//    public IdQLocaCacheWorker(
//        IOperationsService operationsService,
//        JsonWorker itemWorker)
//    {
//        this.operationsService = operationsService;
//        this.itemWorker = itemWorker;
//        Load();
//    }

//    public (string Id, string Loca) Get(string id)
//    {
//        var success = idQlocaDict.TryGetValue(id, out var loca);

//        if (!success)
//        {
//            return default;
//        }

//        return (id, loca);
//    }

//    public bool Put(string id, string address)
//    {
//        var present = idQlocaDict.ContainsKey(id);

//        if (!present)
//        {
//            idQlocaDict.Add(id, address);
//            return true;
//        }

//        idQlocaDict.Remove(id);
//        idQlocaDict.Add(id, address);
//        Save();
//        return true;
//    }

//    private bool Load()
//    {
//        var itemDict = itemWorker.GetItemDict(idQLocaAdrTuple);
//        object body = itemDict[ItemFields.Body];
//        if (body is Dictionary<string, string> bodyDict)
//        {
//            idQlocaDict = bodyDict;
//            return true;
//        }
//        return false;
//    }

//    private bool Save()
//    {
//        var idQlocaJson = operationsService.Json.SerializeObject(idQlocaDict);
//        itemWorker.PutItem(idQLocaAdrTuple, ItemTypes.Text, null, idQlocaJson);
//        return true;
//    }
//}