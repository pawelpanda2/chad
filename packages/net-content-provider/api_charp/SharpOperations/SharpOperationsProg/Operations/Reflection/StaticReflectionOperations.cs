namespace SharpOperationsProg.Operations.Reflection;

public interface IReflectionOpV2
{
    string GetInterface(Type type);
}

public class ReflectionOpV2 : IReflectionOpV2
{
    public string GetInterface(
        Type type)
    {
        var interfaces = type.GetInterfaces();
        if (interfaces.Length == 0)
            return "";
        
        return interfaces[0].Name;
    }
}