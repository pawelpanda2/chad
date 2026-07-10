using System.Reflection;
using SharpOperationsProg.AAPublic;

namespace SharpApiArgsProg;

public class FindMethod
{
    public MethodInfo Try(
        string[] args,
        object worker)
    {
        string methodName = args[2];
        MethodInfo method = GetMethod(worker, methodName);
        return method;
    }

    private MethodInfo GetMethod(
        object worker,
        string propName)
    {
        MethodInfo[] infoList = worker.GetType().GetMethods();
        MethodInfo? foundInfo = default;
        foreach (MethodInfo info in infoList)
        {
            if (info.Name == propName)
            {
                foundInfo = info;
                break;
            }
        }

        return foundInfo ?? throw new InvalidOperationException($"Method {propName} not found");
    }
}