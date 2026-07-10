using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.Credentials;
using SharpOperationsProg.Operations.Date;
using SharpOperationsProg.Operations.Files;
using SharpOperationsProg.Operations.Headers;
using SharpOperationsProg.Operations.Index;
using SharpOperationsProg.Operations.Json;
using SharpOperationsProg.Operations.Path;
using SharpOperationsProg.Operations.Reflection;
using SharpOperationsProg.Operations.UniItemAddress;

namespace SharpOperationsProg.Service;

internal class OperationService : IOperationsService
{
    private readonly IFileService _fileService;
    public IFileWrk File { get; private set; }
    public IIndexOperations Index { get; private set; }
    // public IYamlWrk Yaml { get; private set; }
    public IPathsOperations Path { get; private set; }
    public HeadersOperations Header { get; private set; }
    public IDateOperations Date { get; private set; }
    public IUniAddressOperations UniAddress { get; private set; }
    public IUnitItemOperations UniItem { get; }
    public IGoogleCredentialWorker Credentials { get; private set; }
    public IReflectionOp Reflection { get; private set; }
    public IJsonOperations Json { get; private set; }
    public IFileService GetFileService()
    {
        return _fileService;
    }

    public OperationService(
        IFileService fileService)
    {
        File = new FileWrk(fileService);
        Index = new IndexOperations();
        Date = new DateOperations(Index);
        // Yaml = new YamlWorker();
        Path = new PathsOperations();
        Header = new HeadersOperations();
        UniAddress = new UniAddressOperations(fileService, Index);
        Credentials = new GoogleCredentialWorker();
        Reflection = new ReflectionOp();
        Json = new JsonOperations();
        _fileService = fileService;
    }
}
