using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.Conversations;

public class ConvOperations
{
    public ConvOperationsWorker01 Worker01 { get; }
    public ConvOperationsWorker02 Worker02 { get; }
    public ConvOperationsWorker03 Worker03 { get; }

    public ConvOperations()
    {
        Worker01 = new ConvOperationsWorker01();
        Worker02 = new ConvOperationsWorker02();
        Worker03 = new ConvOperationsWorker03();
    }
}