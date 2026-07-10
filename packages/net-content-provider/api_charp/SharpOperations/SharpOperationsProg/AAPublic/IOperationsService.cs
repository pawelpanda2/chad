using SharpFileServiceProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;
using SharpOperationsProg.Operations.Date;
using SharpOperationsProg.Operations.Headers;
using SharpOperationsProg.Operations.Path;
using SharpOperationsProg.Operations.Reflection;
using SharpOperationsProg.Operations.UniItemAddress;

namespace SharpOperationsProg.AAPublic;

public interface IOperationsService
{
    IDateOperations Date { get; }
    IFileWrk File { get; }
    IIndexOperations Index { get; }
    // IYamlWrk Yaml { get; }
    IPathsOperations Path { get; }
    HeadersOperations Header { get; }
    IUniAddressOperations UniAddress { get; }
    IUnitItemOperations UniItem { get; }
    IGoogleCredentialWorker Credentials { get; }
    IReflectionOp Reflection { get; }
    IJsonOperations Json { get; }
    IFileService GetFileService();
    static IReflectionOpV2 ReflectionV2 = new ReflectionOpV2();
}
