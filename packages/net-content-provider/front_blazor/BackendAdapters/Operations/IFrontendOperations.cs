using BackendAdapters.Operations.Json;
using BackendAdapters.Operations.NoSqlAddress;
using BackendAdapters.Operations.TwoDigitsString;

namespace BackendAdapters.Operations;

public interface IFrontendOperations
{
    public static ITwoDigitsStringOperations TwoDigitsStr { get; }
        = new TwoDigitsStringOperations();

    public static INoSqlAddressOperations NoSqlAddress { get; }
        = new NoSqlAddressOperations();
    
    public static IJsonOperations Json { get; }
        = new JsonOperations();
}
