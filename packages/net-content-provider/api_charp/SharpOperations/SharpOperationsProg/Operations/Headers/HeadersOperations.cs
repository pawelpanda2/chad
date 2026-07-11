namespace SharpOperationsProg.Operations.Headers;

public class HeadersOperations
{
    public HeadersOperationsConversion Convert { get; }
    public HeadersOperationsSelectNeeded Select { get; }
    public TupleElementWorker Select2 { get; }

    public HeadersOperations()
    {
        Convert = new HeadersOperationsConversion();
        Select = new HeadersOperationsSelectNeeded();
        Select2 = new TupleElementWorker();
    }
}