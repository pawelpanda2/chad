namespace SharpFileServiceProg.AAPublic;

public interface IYamlOperations
{
    string Serialize(object input);
    string SerializeToFile(string filePath, object input);

    object Deserialize(string yamlText);
    object DeserializeFile(string path);

    T Deserialize<T>(string yamlText);
    T DeserializeFile<T>(string path);

    bool TryDeserialize<T>(string yamlText, out T result);
}