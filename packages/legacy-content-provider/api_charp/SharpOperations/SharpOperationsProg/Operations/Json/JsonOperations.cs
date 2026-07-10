using Newtonsoft.Json;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.Json;

internal class JsonOperations : IJsonOperations
{
    public JsonOperations()
    {
    }

    public T DeserializeObject<T>(string jsonString)
    {
        var obj = JsonConvert.DeserializeObject<T>(jsonString);
        return obj;
    }

    public bool TryDeserializeObject<T>(
        string jsonString,
        out T? result) where T : class 
    {
        try
        {
            result = DeserializeObject<T>(jsonString);
            return true;
        }
        catch (Exception ex)
        {
            result = null;
            return false;
        }
    }

    public string SerializeObject(object obj)
    {
        var jsonString = JsonConvert.SerializeObject(obj);
        return jsonString;
    }

    public T TryDeserializeObject<T>(string jsonString)
    {
        try
        {
            var obj = DeserializeObject<T>(jsonString);
            return obj;
        }
        catch (Exception ex)
        {
            return default;
        }
    }

    public string TrySerializeObject(object obj)
    {
        try
        {
            var jsonString = JsonConvert.SerializeObject(obj);
            return jsonString;
        }
        catch (Exception ex)
        {
            return default;
        }
    }
}