using SharpRepoServiceProg.Duplications.Operations.Files;

namespace SharpRepoServiceProg.Duplications.Operations;

public class CustomOperationsService
{
    public CustomOperationsService()
    {
        Index = new IndexOperations();
        UniAddress = new UniAddressOperations(Index);
        File = new FileOperations();
    }

    public FileOperations File { get; set; }

    public IndexOperations Index { get; }
    public UniAddressOperations UniAddress { get; } 
}