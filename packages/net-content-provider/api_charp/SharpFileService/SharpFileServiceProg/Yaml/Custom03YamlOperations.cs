using System.Text;
using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Yaml.Custom.Emitter;
using YamlDotNet.Serialization;

namespace SharpFileServiceProg.Yaml;

internal class Custom03YamlOperations : IYamlOperations
{
    private readonly IDeserializer custom03Deserializer;
    private readonly ISerializer custom03Serializer;

    public Custom03YamlOperations()
    {
        var builder = new DeserializerBuilder();
        custom03Deserializer = builder.Build();

        var builder2 = new SerializerBuilder().
            WithEventEmitter(next => new QuotedScalarEventEmitter(next));
        custom03Serializer = builder2.Build();
    }

    public string Serialize(object input)
    {
        try
        {
            var result = custom03Serializer.Serialize(input);
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
            var result = custom03Serializer.Serialize(input);
            File.WriteAllText(filePath, result);
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
            var result = custom03Deserializer.Deserialize<object>(yamlText);
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
            var result = custom03Deserializer.Deserialize<object>(yamlText);
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
        var result = custom03Deserializer.Deserialize<T>(yamlText);
        return result;
    }

    public T DeserializeFile<T>(string path)
    {
        try
        {
            var yamlText = FileReadText(path);
            var result = custom03Deserializer.Deserialize<T>(yamlText);
                
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
        //throw ex;
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

    private IEnumerable<string> FileReadLines(string filePath)
    {
        var text = FileReadText(filePath);

        var lines = text.Split('\n');
        return lines;
    }

    private string FileReadText(string filePath)
    {
        var text = string.Empty;
        using (StreamReader streamReader = new StreamReader(filePath, Encoding.UTF8, true))
        {
            text = streamReader.ReadToEnd();
        }

        return text;
    }
}
