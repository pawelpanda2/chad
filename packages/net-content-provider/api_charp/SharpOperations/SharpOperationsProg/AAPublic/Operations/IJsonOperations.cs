namespace SharpOperationsProg.AAPublic.Operations;

public interface IJsonOperations
{
    T DeserializeObject<T>(string jsonString);
    T TryDeserializeObject<T>(string jsonString);

    bool TryDeserializeObject<T>(string jsonString, out T? result) where T : class;
    string SerializeObject(object obj);
    string TrySerializeObject(object obj);
}