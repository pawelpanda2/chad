using System.Reflection;
using SharpOperationsProg.AAPublic;
using SharpOperationsProg.AAPublic.Operations;

namespace SharpOperationsProg.Operations.Reflection;

public class ReflectionOp : IReflectionOp
{
    public IEnumerable<(string, string)> GetPropTuples(object obj)
    {
        var properties = obj.GetType().GetProperties();
        var tuples = properties.Select(x => (x.Name, x.GetValue(obj).ToString()));
        return tuples;
    }

    public List<string> GetPropNames<T>(params string[] propArray)
    {
        var type = typeof(T);
        var propNames = type.GetProperties().Select(x => x.Name).ToList();
        return propNames;
    }

    public List<PropertyInfo> GetPropList<T>(params string[] propArray)
    {
        var type = typeof(T);
        var propList = type.GetProperties().ToList();
        return propList;
    }

    public bool HasProp<T>(params string[] propArray)
    {
        var type = typeof(T);
        var propNames = type.GetProperties().Select(x => x.Name).ToList();
        foreach (var prop in propArray)
        {
            if (!propNames.Any(x => x == prop))
            {
                return false;
            }
        }

        return true;
    }
    
    public static string GetInterface(
        Type type)
    {
        var interfaces = type.GetInterfaces();
        if (interfaces.Length == 0)
            return "";
        
        return interfaces[0].Name;
    }
}