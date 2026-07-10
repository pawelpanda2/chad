using System;
using SharpRepoServiceProg.AAPublic.Names;
using SharpRepoServiceProg.Models;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;
using SharpRepoServiceProg.Workers.CrudWrites.WriteFolders;
using SharpRepoServiceProg.Workers.CrudWrites.WriteRefs;
using SharpRepoServiceProg.Workers.System;
using SharpRepoServiceProg.Workers.Validation;

namespace SharpRepoServiceProg.Workers.CrudWrites;

internal class WriteMultiWorker
{
    private readonly PathWorker pw;
    private readonly SystemWorker _sw;
    private readonly ConfigWorker _cw;
    private readonly BodyWorker _bw;
    private readonly ReadFolderWorker _readFolder;
    private readonly ReadTextWorker _readText;
    private readonly WriteTexts.WriteTextWorker _writeText;
    private readonly WriteFolderWorker _writeFolder;
    private readonly WriteRefWorker _writeRef;
    private readonly ValidationWorker _validation;
    
    private UniType _myType = UniType.Text;

    public WriteMultiWorker()
    {
        _readFolder = MyBorder.MyContainer.Resolve<ReadFolderWorker>();
        _readText = MyBorder.MyContainer.Resolve<ReadTextWorker>();
        _writeFolder = MyBorder.MyContainer.Resolve<WriteFolderWorker>();
        _writeText = MyBorder.MyContainer.Resolve<WriteTexts.WriteTextWorker>();
        _writeRef = MyBorder.MyContainer.Resolve<WriteRefWorker>();
        _validation = MyBorder.MyContainer.Resolve<ValidationWorker>();

        _bw = MyBorder.MyContainer.Resolve<BodyWorker>();
        _cw = MyBorder.MyContainer.Resolve<ConfigWorker>();
        _sw = MyBorder.MyContainer.Resolve<SystemWorker>();
    }

    public bool PostItem(
        ref ItemModel item,
        (string Repo, string Loca) adrTuple,
        string type,
        string name)
    {
        bool isKnownType = Enum.TryParse<UniType>(type, out var uniType);
        if (!isKnownType) { return false; }
        
        // Validate repository structure - check for non-numeric child folders
        // This is the central validation point for all Post operations
        bool isValid = _validation.ValidateParentBeforeCreateChild(
            adrTuple,
            out string errorMessage,
            out string invalidFolderName,
            out string parentPath);
        
        if (!isValid)
        {
            throw new InvalidOperationException(errorMessage);
        }
        
        bool s01 = _writeText.IfMineParentPost(ref item, name, adrTuple, uniType);
        bool s02 = _writeFolder.IfMineParentPost(ref item, name, adrTuple, uniType);
        bool s03 = _writeRef.IfMineParentPost(ref item, name, adrTuple, uniType);

        return s01 || s02 || s03;
    }
    
    public bool PutItem(
        ref ItemModel item,
        (string repo, string loca) adrTuple,
        string type,
        string name,
        string body = "")
    {
        bool isKnownType = Enum.TryParse<UniType>(type, out var uniType);
        if (!isKnownType) { return false; }

        bool isValidLoca = _validation.ValidateItemLocaBeforePut(
            adrTuple,
            out string errorMessage,
            out _);
        if (!isValidLoca)
        {
            throw new InvalidOperationException(errorMessage);
        }
        
        bool s01 = _writeText.IfMinePut(ref item, name, adrTuple, body, uniType);
        bool s02 = _writeFolder.IfMinePut(ref item, name, adrTuple, body, uniType);
        return s01 || s02;
    }
}
