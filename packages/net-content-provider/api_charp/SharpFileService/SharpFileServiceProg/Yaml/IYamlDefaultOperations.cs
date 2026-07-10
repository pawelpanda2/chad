using System.Text;
using SharpFileServiceProg.AAPublic;
using SharpFileServiceProg.Yaml.Custom.Emitter;
using YamlDotNet.Serialization;

namespace SharpFileServiceProg.Yaml;

public interface IYamlDefaultOperations : IYamlOperations
{
    static IDeserializer custom03Deserializer =
        new DeserializerBuilder().Build();

    static ISerializer custom03Serializer =
        new SerializerBuilder().WithEventEmitter(next => new QuotedScalarEventEmitter(next)).Build();

    static string Serialize(object input)
    {
        try
        {
            var result = custom03Serializer.Serialize(input);
            return result;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    static string SerializeToFile(string filePath, object input)
    {
        try
        {
            var result = custom03Serializer.Serialize(input);
            File.WriteAllText(filePath, result);
            return result;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    static object Deserialize(string yamlText)
    {
        try
        {
            var result = custom03Deserializer.Deserialize<object>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    static object DeserializeFile(string path)
    {
        try
        {
            var yamlText = File.ReadAllText(path);
            var result = custom03Deserializer.Deserialize<object>(yamlText);
            return result;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    static T Deserialize<T>(string yamlText)
    {
        var result = custom03Deserializer.Deserialize<T>(yamlText);
        return result;
    }

    static T DeserializeFile<T>(string path)
    {
        try
        {
            var yamlText = FileReadText(path);
            var result = custom03Deserializer.Deserialize<T>(yamlText);

            return result;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    static bool TryDeserialize<T>(string yamlText, out T result)
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

    private static IEnumerable<string> FileReadLines(string filePath)
    {
        var text = FileReadText(filePath);

        var lines = text.Split('\n');
        return lines;
    }

    private static string FileReadText(string filePath)
    {
        var text = string.Empty;
        using (StreamReader streamReader = new StreamReader(filePath, Encoding.UTF8, true))
        {
            text = streamReader.ReadToEnd();
        }

        return text;
    }
}
