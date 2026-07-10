using SharpFileServiceProg.AAPublic;
using VYaml.Serialization;

namespace SharpOperationsProg.Operations.Yaml;

internal class VYamlCoreOperations : IYamlOperations
{
    public string Serialize(object input)
    {
        try
        {
            var result = YamlSerializer.SerializeToString(input);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    public string SerializeToFile(string filePath, object input)
    {
        try
        {
            var result = YamlSerializer.SerializeToString(input);
            File.WriteAllText(result, filePath);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    public object Deserialize(string yamlText)
    {
        throw new NotImplementedException();
    }

    public object DeserializeFile(string path)
    {
        throw new NotImplementedException();
    }

    public T Deserialize<T>(string yamlText)
    {
        throw new NotImplementedException();
    }

    public T DeserializeFile<T>(string path)
    {
        throw new NotImplementedException();
    }

    private void HandleError(Exception ex)
    {
        throw ex;
    }

    public bool TryDeserialize<T>(string yamlText, out T result)
    {
        throw new NotImplementedException();
    }
}