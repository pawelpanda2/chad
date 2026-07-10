using SharpFileServiceProg.AAPublic;
using SharpYamlSerializer = SharpYaml.Serialization.Serializer;

namespace SharpFileServiceProg.Yaml;

internal class SharpYamlOperations : IYamlOperations
{
    private SharpYamlSerializer sharpSerializer;

    public SharpYamlOperations()
    {
        sharpSerializer = new SharpYamlSerializer();
    }

    public string Serialize(object input)
    {
        try
        {
            var result = sharpSerializer.Serialize(input);
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
            var result = sharpSerializer.Serialize(input);
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
        try
        {
            var result = sharpSerializer.Deserialize<object>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    public object DeserializeFile(string path)
    {
        try
        {
            var yamlText = File.ReadAllText(path);
            var result = sharpSerializer.Deserialize<object>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    public T Deserialize<T>(string yamlText)
    {
        var result = sharpSerializer.Deserialize<T>(yamlText);
        return result;
    }

    public bool TryDeserialize<T>(string yamlText, out T result)
    {
        try
        {
            result = Deserialize<T>(yamlText);
            return true;
        }
        catch (Exception ex)
        {
            result = default;
            return false;
        }
    }

    public T DeserializeFile<T>(string path)
    {
        try
        {
            var yamlLines = File.ReadAllLines(path);
            var yamlText = string.Join('\n', yamlLines);
            var result = sharpSerializer.Deserialize<T>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    private void HandleError(Exception ex)
    {
        throw ex;
    }
}