using System.Collections.Generic;
using System.Linq;
using SharpFileServiceProg.AAPublic;
using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudReads;

internal class ReadAddressWorker
{
    private readonly CustomOperationsService _customOperationsService;
    private readonly ReadManyWorker _readMany;
    private readonly PathWorker _path;
    private readonly SystemWorker _system;
    private readonly ReadHelper _helper;

    public ReadAddressWorker()
    {
        _customOperationsService = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
        _system = MyBorder.MyContainer.Resolve<SystemWorker>();
        _helper = MyBorder.MyContainer.Resolve<ReadHelper>();
        _readMany = MyBorder.MyContainer.Resolve<ReadManyWorker>();
    }
	
    public bool GetAdrTupleByName(
        (string Repo, string Loca) adrTuple,
        string name,
        out (string, string) foundAdrTuple)
    {
        List<ItemModel> items = _readMany
            .ListOfOnlyConfigItems(adrTuple);
        ItemModel found = items.SingleOrDefault(x => 
            x.Name.ToString() == name);
        if (found == null)
        {
            foundAdrTuple = default;
            return false;
        }

        foundAdrTuple = _customOperationsService.UniAddress
            .CreateAddressFromString(found.Address);
        return true;
    }
	
    // read; config
    public bool GetAdrTupleBySequenceOfNames(
        (string Repo, string Loca) inputAdrTuple,
        out (string, string) foundAdrTuple,
        params string[] names)
    {
        foundAdrTuple = default;
        bool s01 = false;
        var parentAdrTuple = inputAdrTuple;
        foreach (var name in names)
        {
            s01 = GetAdrTupleByName(parentAdrTuple, name, out foundAdrTuple);
            if (!s01) break;
            parentAdrTuple = foundAdrTuple;
        }

        return s01;
    }
    
    public List<(string, string)> GetSubAdrTuples(
        (string Repo, string Loca) adrTuple)
    {
        string itemPath = _path.GetItemPath(adrTuple);
        string[] dirs = _system.GetDirectories(itemPath);
        List<(string Repo, string)> subAddresses = dirs
            .Select(x => (adrTuple.Repo, _helper
                .SelectDirToSection(adrTuple.Loca, x)))
            .ToList();
        return subAddresses;
    }
}
