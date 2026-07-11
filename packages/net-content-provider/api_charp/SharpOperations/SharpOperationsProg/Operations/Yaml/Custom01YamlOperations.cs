using SharpFileServiceProg.AAPublic;
using YamlDotNet.Serialization;

namespace SharpOperationsProg.Operations.Yaml;

internal class Custom01YamlOperations : IYamlOperations
{
    private readonly IDeserializer custom01Deserializer;
    private readonly ISerializer custom01Serializer;

    public Custom01YamlOperations()
    {
        var builder = new DeserializerBuilder()
            .WithAttemptingUnquotedStringTypeDeserialization();
        custom01Deserializer = builder.Build();

        var builder2 = new SerializerBuilder()
            .WithQuotingNecessaryStrings(true);
        custom01Serializer = builder2.Build();
    }

    public string Serialize(object input)
    {
        try
        {
            var result = custom01Serializer.Serialize(input);
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
            var result = custom01Serializer.Serialize(input);
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
            var result = custom01Deserializer.Deserialize<object>(yamlText);
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
            var result = custom01Deserializer.Deserialize<object>(yamlText);
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
        try
        {
            var result = custom01Deserializer.Deserialize<T>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            HandleError(ex);
            return default;
        }
    }

    public T DeserializeFile<T>(string path)
    {
        try
        {
            var yamlText = File.ReadAllText(path);
            var result = custom01Deserializer.Deserialize<T>(yamlText);
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
}