using System;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.Validation;

namespace SharpRepoServiceProg.Workers.CrudWrites.WriteTexts;

internal partial class WriteTextWorker
{
    private readonly ValidationWorker _validation;

    public WriteTextWorker()
    {
        _validation = MyBorder.MyContainer.Resolve<ValidationWorker>();
    }

    internal bool IfMineParentPost(
        ref ItemModel item,
        string name,
        (string Repo, string Loca) parentAdrTuple,
        UniType type = UniType.Text)
    {
        if (type != _myUniType) { return false; }
        
        // Validate repository structure - check for non-numeric child folders
        IfNotInitialized();
        bool isValid = _validation.ValidateParentBeforeCreateChild(
            parentAdrTuple,
            out string errorMessage,
            out string invalidFolderName,
            out string parentPath);
        
        if (!isValid)
        {
            throw new InvalidOperationException(errorMessage);
        }
        
        bool s01 = _readMulti.GetItemBySeqOfNames(ref item, parentAdrTuple, name);
        if (s01)
        {
            return false; // new item created = false, already existed = true 
        }

        var nextAdrTuple = _readFolder.GetNextAdrTuple(parentAdrTuple);
        item = PrepareItem(name, nextAdrTuple, string.Empty);
        Put(item);
        return true; // new item created = true, already existed = false
    }
}
