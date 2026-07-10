namespace BackendAdapters.Operations.Json;

public interface IJsonOperations
{
    T DeserializeObject<T>(string jsonString);

    bool TryDeserializeObject<T>(
        string jsonString,
        out T? result) where T : class;

    T TryDeserializeObject<T>(string jsonString);
    string SerializeObject(object obj);
    string TrySerializeObject(object obj);
}
