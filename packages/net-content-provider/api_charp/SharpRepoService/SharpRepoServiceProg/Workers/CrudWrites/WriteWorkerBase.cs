using SharpRepoServiceProg.Duplications.Operations;
using SharpRepoServiceProg.Registrations;
using SharpRepoServiceProg.Workers.CrudReads;
using SharpRepoServiceProg.Workers.System;

namespace SharpRepoServiceProg.Workers.CrudWrites;

public class WriteWorkerBase
{
    //internal readonly IFileService _fileService;
    internal readonly CustomOperationsService _operations;
    // internal readonly IYamlOperations _yamlOperations;
    internal readonly PathWorker _path;
    internal readonly BodyWorker _body;
    internal readonly ConfigWorker _config;
    internal readonly SystemWorker _system;
    // internal readonly MemoryWorker _memory;
    internal readonly MigrationWorker _migrate;
    // internal readonly ReadManyWorker _readMany;
    
    internal readonly ReadFolderWorker _readFolder;
    internal readonly ReadTextWorker _readText;
    internal readonly ReadAddressWorker _address;

    public object ErrorValue { get; internal set; }

    public WriteWorkerBase()
    {
        // _fileService = MyBorder.OutContainer.Resolve<IFileService>();
        _operations = MyBorder.MyContainer.Resolve<CustomOperationsService>();
        // _yamlOperations = _fileService.Yaml.Custom03;
        
        _system = MyBorder.MyContainer.Resolve<SystemWorker>();
        _path = MyBorder.MyContainer.Resolve<PathWorker>();
        _config = MyBorder.MyContainer.Resolve<ConfigWorker>();
        _body = MyBorder.MyContainer.Resolve<BodyWorker>();
        // _memory = MyBorder.MyContainer.Resolve<MemoryWorker>();
        _migrate = MyBorder.MyContainer.Resolve<MigrationWorker>();
        // _readMany = MyBorder.MyContainer.Resolve<ReadManyWorker>();
        _readFolder = MyBorder.MyContainer.Resolve<ReadFolderWorker>();
        _readText = MyBorder.MyContainer.Resolve<ReadTextWorker>();
        _address = MyBorder.MyContainer.Resolve<ReadAddressWorker>();
    }
}
