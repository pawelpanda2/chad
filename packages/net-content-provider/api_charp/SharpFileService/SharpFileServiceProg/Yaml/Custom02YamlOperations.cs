using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Yaml.Custom.TypeConverter;
using YamlDotNet.Serialization;

namespace SharpFileServiceProg.Yaml;

internal class Custom02YamlOperations : IYamlOperations
{
    private readonly IDeserializer custom01Deserializer;
    private readonly ISerializer custom01Serializer;

    public Custom02YamlOperations()
    {
        var builder = new DeserializerBuilder();
        custom01Deserializer = builder.Build();

        var builder2 = new SerializerBuilder()
            .WithTypeConverter(new QuotedValueConverter());
        //.WithEventEmitter(next => new QuotedScalarEventEmitter(next));
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
        throw new NotImplementedException();
    }
}