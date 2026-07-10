using System.Reflection;

namespace SharpApiArgsProg;

internal class FindWorker
{
    public object Try(
        string[] args,
        object service)
    {
        string workerName = args[1];
        object worker = GetProperty(service, workerName);
        return worker;
    }

    private object GetProperty(
        object service,
        string propName)
    {
        PropertyInfo[] infoList = service.GetType().GetProperties();
        PropertyInfo? foundInfo = null;
        foreach (var info in infoList)
        {
            if (info.PropertyType.Name == propName)
            {
                foundInfo = info;
                break;
            }
        }

        object? prop = foundInfo?.GetValue(service);
        return prop ?? throw new InvalidOperationException($"Property {propName} not found");
    }
}
