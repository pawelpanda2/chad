using System.Reflection;

namespace SharpOperationsProg.AAPublic.Operations;

public class RunMethodsBase
{
    protected object? _obj;
    protected Type _objType;
    public List<string> MethodNames { get; private set; }
    public Dictionary<string, Func<object?[], object?>> MethodsDict{ get; private set; }

    public RunMethodsBase(object obj = null)
    {
        _obj = obj;
        _obj ??= this;
        _objType = _obj.GetType();
        SetMethodNames();
    }

    public object? RunMethod(
        string methodName, params object?[] args)
    {
        object? result = MethodsDict[methodName]
            .Invoke(args);
        return result;
    }
    
    public async Task RunMethodAsync(
        string methodName, params object?[] args)
    {
        new Task(() => MethodsDict[methodName]
            .Invoke(args));
    }

    private void SetMethodNames()
    {
        MethodInfo[] methodInfos = _objType.GetMethods();
        
        List<string> result = methodInfos
            .Select(m => m.Name).ToList();

        result.Remove("GetType");
        result.Remove("GetHashCode");
        result.Remove("ToString");
        result.Remove("Equals");
        result.Remove("RunMethodAsync");
        result.Remove("GetMethodNames");

        MethodNames = result;
        SetMethodsDict(methodInfos);
    }

    private void SetMethodsDict(
        MethodInfo[] methodInfos)
    {
        MethodsDict = new Dictionary<string, Func<object?[], object?>>();
        
        foreach (var info in methodInfos)
        {
            ParameterInfo[] parameters = info.GetParameters();
            object?[] parametersArray = new Object[parameters.Length];

            Func<object?[], object?> func = x =>
            {
                object? result = info.Invoke(_obj, parametersArray);
                return result;
            };
            
            MethodsDict.Add(info.Name, func);
        }
    }
}
